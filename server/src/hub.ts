import { randomUUID } from 'node:crypto';
import type { PushMessage } from './push.js';
import { toPublicUser, type Store, type User } from './store.js';

export type HubSocket = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

type Timer = ReturnType<typeof setTimeout>;

function unref(timer: Timer) {
  (timer as { unref?: () => void }).unref?.();
  return timer;
}

type Client = {
  userId: string;
  socket: HubSocket;
  lastActivity: number;
  eventTimes: number[];
};

type CallKind = 'random' | 'friend';

type Call = {
  id: string;
  kind: CallKind;
  caller: string;
  callee: string;
  state: 'ringing' | 'active';
  createdAt: number;
  ringTimer?: Timer;
};

type QueueEntry = {
  userId: string;
  since: number;
  verifiedOnly: boolean;
};

export type HubOptions = {
  ringTimeoutMs?: number;
  reconnectGraceMs?: number;
  rematchCooldownMs?: number;
  rematchWaitMs?: number;
  matchIntervalMs?: number;
  offlineRingMs?: number;
};

const OPEN = 1;

export class Hub {
  private clients = new Map<string, Client>();
  private queue: QueueEntry[] = [];
  private calls = new Map<string, Call>();
  private userCall = new Map<string, string>();
  private lastPartner = new Map<string, { peer: string; at: number }>();
  private graceTimers = new Map<string, Timer>();
  private onlineTimer: Timer | null = null;
  private matchTimer: Timer;
  private ringTimeoutMs: number;
  private reconnectGraceMs: number;
  private rematchCooldownMs: number;
  private rematchWaitMs: number;
  private offlineRingMs: number;
  onPush: ((userId: string, message: PushMessage) => void) | null = null;

  constructor(
    private store: Store,
    options: HubOptions = {},
  ) {
    this.ringTimeoutMs = options.ringTimeoutMs ?? 45_000;
    this.reconnectGraceMs = options.reconnectGraceMs ?? 15_000;
    this.rematchCooldownMs = options.rematchCooldownMs ?? 120_000;
    this.rematchWaitMs = options.rematchWaitMs ?? 8_000;
    this.offlineRingMs = options.offlineRingMs ?? 60_000;
    this.matchTimer = unref(setInterval(() => this.matchWaiting(), options.matchIntervalMs ?? 2_000));
  }

  get onlineCount() {
    return this.clients.size;
  }

  isOnline(userId: string) {
    return this.clients.has(userId);
  }

  isInCall(userId: string) {
    return this.userCall.has(userId);
  }

  attach(user: User, socket: HubSocket) {
    const previous = this.clients.get(user.id);
    const wasOnline = !!previous || this.graceTimers.has(user.id);
    const grace = this.graceTimers.get(user.id);
    if (grace) {
      clearTimeout(grace);
      this.graceTimers.delete(user.id);
    }
    if (previous && previous.socket !== socket) {
      previous.socket.close(4000, 'replaced');
    }
    const client: Client = { userId: user.id, socket, lastActivity: Date.now(), eventTimes: [] };
    this.clients.set(user.id, client);
    this.store.touch(user.id);

    const callId = this.userCall.get(user.id);
    const call = callId ? this.calls.get(callId) : undefined;
    this.send(user.id, {
      type: 'hello',
      user: toPublicUser(user),
      online: this.onlineCount,
      activeCallId: call?.state === 'active' ? call.id : null,
      notices: this.store.unseenNotices(user.id),
    });
    if (call?.state === 'active') {
      this.send(this.peerOf(call, user.id), { type: 'peer.reconnected', callId: call.id });
    }
    if (call?.state === 'ringing' && call.callee === user.id) {
      const caller = this.store.getUser(call.caller);
      if (caller) this.send(user.id, { type: 'call.incoming', callId: call.id, peer: toPublicUser(caller) });
    }
    if (!wasOnline) this.broadcastPresence(user.id, true);
    this.scheduleOnlineBroadcast();
    return client;
  }

  detach(client: Client) {
    if (this.clients.get(client.userId) !== client) return;
    const userId = client.userId;
    this.clients.delete(userId);
    this.leaveQueue(userId);
    this.store.touch(userId);

    const callId = this.userCall.get(userId);
    const call = callId ? this.calls.get(callId) : undefined;
    if (call?.state === 'ringing') {
      if (call.caller === userId) this.endCall(call, userId, 'unavailable');
    } else if (call) {
      this.send(this.peerOf(call, userId), { type: 'peer.reconnecting', callId: call.id });
    }

    const timer = setTimeout(() => {
      this.graceTimers.delete(userId);
      if (this.clients.has(userId)) return;
      const currentCallId = this.userCall.get(userId);
      const current = currentCallId ? this.calls.get(currentCallId) : undefined;
      if (current?.state === 'active') this.endCall(current, userId, 'disconnected');
      this.broadcastPresence(userId, false);
    }, this.reconnectGraceMs);
    unref(timer);
    this.graceTimers.set(userId, timer);
    this.scheduleOnlineBroadcast();
  }

  handle(client: Client, raw: string) {
    client.lastActivity = Date.now();
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
    const userId = client.userId;
    switch (message.type) {
      case 'ping':
        this.send(userId, { type: 'pong' });
        return;
      case 'meet.start':
        this.startMeeting(userId, message.verifiedOnly === true);
        return;
      case 'meet.stop':
        this.leaveQueue(userId);
        this.send(userId, { type: 'meet.stopped' });
        return;
      case 'call.ring':
        this.ring(userId, String(message.userId ?? ''));
        return;
      case 'call.answer':
        this.answer(userId, String(message.callId ?? ''));
        return;
      case 'call.decline':
      case 'call.cancel':
      case 'call.hangup': {
        const call = this.calls.get(String(message.callId ?? ''));
        if (call && (call.caller === userId || call.callee === userId)) {
          const reason = message.type === 'call.decline' ? 'declined' : message.type === 'call.cancel' ? 'cancelled' : 'hangup';
          this.endCall(call, userId, reason);
        }
        return;
      }
      case 'call.event': {
        const call = this.calls.get(String(message.callId ?? ''));
        if (!call || call.state !== 'active') return;
        if (call.caller !== userId && call.callee !== userId) return;
        const now = Date.now();
        client.eventTimes = client.eventTimes.filter((t) => now - t < 10_000);
        if (client.eventTimes.length >= 15) return;
        client.eventTimes.push(now);
        const event = sanitizeEvent(message.event);
        if (event) this.send(this.peerOf(call, userId), { type: 'call.event', callId: call.id, event });
        return;
      }
      case 'signal': {
        const call = this.calls.get(String(message.callId ?? ''));
        if (!call || call.state !== 'active') return;
        if (call.caller !== userId && call.callee !== userId) return;
        this.send(this.peerOf(call, userId), { type: 'signal', callId: call.id, data: message.data });
        return;
      }
    }
  }

  sweep(idleMs: number) {
    const now = Date.now();
    for (const client of this.clients.values()) {
      if (now - client.lastActivity > idleMs) client.socket.close(4002, 'idle');
    }
  }

  send(userId: string, payload: unknown) {
    const client = this.clients.get(userId);
    if (client && client.socket.readyState === OPEN) {
      client.socket.send(JSON.stringify(payload));
    }
  }

  notifyFriendsChanged(userId: string) {
    this.send(userId, { type: 'friends.changed' });
  }

  disconnectUser(userId: string, code: number, reason: string) {
    const callId = this.userCall.get(userId);
    const call = callId ? this.calls.get(callId) : undefined;
    if (call) this.endCall(call, userId, 'hangup');
    this.leaveQueue(userId);
    this.clients.get(userId)?.socket.close(code, reason);
  }

  endCallBetween(a: string, b: string) {
    const callId = this.userCall.get(a);
    const call = callId ? this.calls.get(callId) : undefined;
    if (call && (call.caller === b || call.callee === b)) this.endCall(call, a, 'hangup');
  }

  shutdown() {
    clearInterval(this.matchTimer);
    for (const timer of this.graceTimers.values()) clearTimeout(timer);
    for (const call of this.calls.values()) if (call.ringTimer) clearTimeout(call.ringTimer);
    if (this.onlineTimer) clearTimeout(this.onlineTimer);
    for (const client of this.clients.values()) client.socket.close(1001, 'server restarting');
  }

  private peerOf(call: Call, userId: string) {
    return call.caller === userId ? call.callee : call.caller;
  }

  private leaveQueue(userId: string) {
    this.queue = this.queue.filter((entry) => entry.userId !== userId);
  }

  private startMeeting(userId: string, wantsVerified: boolean) {
    if (this.userCall.has(userId)) {
      this.send(userId, { type: 'error', code: 'busy' });
      return;
    }
    this.leaveQueue(userId);
    const verifiedOnly = wantsVerified && !!this.store.getUser(userId)?.ageVerified;
    const entry: QueueEntry = { userId, since: Date.now(), verifiedOnly };
    const partner = this.findPartner(entry, 0);
    if (partner) {
      this.leaveQueue(partner.userId);
      this.connectPair(userId, partner.userId);
      return;
    }
    this.queue.push(entry);
    this.send(userId, { type: 'meet.searching', online: this.onlineCount, verifiedOnly });
  }

  private matchWaiting() {
    for (const entry of [...this.queue]) {
      if (!this.queue.includes(entry)) continue;
      const partner = this.findPartner(entry, Date.now() - entry.since);
      if (!partner) continue;
      this.leaveQueue(entry.userId);
      this.leaveQueue(partner.userId);
      this.connectPair(entry.userId, partner.userId);
    }
  }

  private findPartner(mine: QueueEntry, waitedMs: number): QueueEntry | null {
    const userId = mine.userId;
    const me = this.store.getUser(userId);
    if (!me) return null;
    const now = Date.now();
    let best: { entry: QueueEntry; shared: number } | null = null;
    for (const entry of this.queue) {
      if (entry.userId === userId) continue;
      if (!this.clients.has(entry.userId) || this.userCall.has(entry.userId)) continue;
      if (this.store.isBlockedEither(userId, entry.userId)) continue;
      const recent = this.lastPartner.get(userId);
      const theirRecent = this.lastPartner.get(entry.userId);
      const metJustNow =
        (recent?.peer === entry.userId && now - recent.at < this.rematchCooldownMs) ||
        (theirRecent?.peer === userId && now - theirRecent.at < this.rematchCooldownMs);
      if (metJustNow && Math.max(waitedMs, now - entry.since) < this.rematchWaitMs) continue;
      const other = this.store.getUser(entry.userId);
      if (!other || other.banned) continue;
      if (mine.verifiedOnly && !other.ageVerified) continue;
      if (entry.verifiedOnly && !me.ageVerified) continue;
      if (me.languages.length && other.languages.length && !me.languages.some((l) => other.languages.includes(l))) continue;
      const shared = other.interests.filter((i) => me.interests.includes(i)).length;
      if (!best || shared > best.shared) best = { entry, shared };
    }
    return best?.entry ?? null;
  }

  private connectPair(caller: string, callee: string) {
    const now = Date.now();
    const call: Call = {
      id: randomUUID(),
      kind: 'random',
      caller,
      callee,
      state: 'active',
      createdAt: now,
    };
    this.calls.set(call.id, call);
    this.userCall.set(caller, call.id);
    this.userCall.set(callee, call.id);
    this.store.recordCall(call.id, caller, callee, call.kind);
    this.lastPartner.set(caller, { peer: callee, at: now });
    this.lastPartner.set(callee, { peer: caller, at: now });
    this.announceStart(call);
  }

  private ring(callerId: string, calleeId: string) {
    const callee = this.store.getUser(calleeId);
    if (!callee || callee.banned || !this.store.areFriends(callerId, calleeId)) {
      this.send(callerId, { type: 'call.unavailable', userId: calleeId, reason: 'not-friends' });
      return;
    }
    if (this.userCall.has(callerId)) {
      this.send(callerId, { type: 'error', code: 'busy' });
      return;
    }
    if (this.userCall.has(calleeId)) {
      this.send(callerId, { type: 'call.unavailable', userId: calleeId, reason: 'busy' });
      return;
    }
    const caller = this.store.getUser(callerId);
    if (!caller) return;
    this.leaveQueue(callerId);
    this.leaveQueue(calleeId);

    const call: Call = {
      id: randomUUID(),
      kind: 'friend',
      caller: callerId,
      callee: calleeId,
      state: 'ringing',
      createdAt: Date.now(),
    };
    const offline = !this.clients.has(calleeId);
    call.ringTimer = unref(setTimeout(() => this.endCall(call, calleeId, 'no-answer'), offline ? this.offlineRingMs : this.ringTimeoutMs));
    this.calls.set(call.id, call);
    this.userCall.set(callerId, call.id);
    this.userCall.set(calleeId, call.id);
    this.send(callerId, { type: 'call.ringing', callId: call.id, peer: toPublicUser(callee), offline });
    this.send(calleeId, { type: 'call.incoming', callId: call.id, peer: toPublicUser(caller) });
    if (offline) {
      this.onPush?.(calleeId, {
        title: `${caller.name} is calling you`,
        body: 'Tap to open TeaTime and answer the video call.',
        channel: 'calls',
        tag: `call-${call.id}`,
        data: { type: 'call', callId: call.id, userId: callerId },
        ttlSeconds: Math.round(this.offlineRingMs / 1000),
      });
    }
  }

  private recordMissedCall(call: Call) {
    const caller = this.store.getUser(call.caller);
    const callee = this.store.getUser(call.callee);
    if (!caller || !callee) return;
    const message = this.store.addMessage(call.caller, call.callee, 'missed-call', '');
    this.send(call.callee, { type: 'chat.message', message, user: toPublicUser(caller) });
    this.send(call.caller, { type: 'chat.message', message, user: toPublicUser(callee) });
    if (!this.clients.has(call.callee)) {
      this.onPush?.(call.callee, {
        title: `Missed call from ${caller.name}`,
        body: 'Tap to call back.',
        channel: 'messages',
        tag: `call-${call.id}`,
        data: { type: 'missed-call', userId: call.caller },
      });
    }
  }

  private answer(userId: string, callId: string) {
    const call = this.calls.get(callId);
    if (!call || call.callee !== userId || call.state !== 'ringing') {
      this.send(userId, { type: 'call.ended', callId, reason: 'cancelled' });
      return;
    }
    if (call.ringTimer) clearTimeout(call.ringTimer);
    call.state = 'active';
    this.store.recordCall(call.id, call.caller, call.callee, call.kind);
    this.announceStart(call);
  }

  private announceStart(call: Call) {
    const caller = this.store.getUser(call.caller);
    const callee = this.store.getUser(call.callee);
    if (!caller || !callee) {
      this.endCall(call, call.caller, 'unavailable');
      return;
    }
    const shared = caller.interests.filter((i) => callee.interests.includes(i));
    const describe = (me: User, peer: User) => ({
      type: 'call.start',
      callId: call.id,
      kind: call.kind,
      initiator: me.id === call.caller,
      peer: toPublicUser(peer),
      sharedInterests: shared,
      friendship: this.store.areFriends(me.id, peer.id)
        ? 'friends'
        : this.store.hasFriendRequest(me.id, peer.id)
          ? 'requested'
          : this.store.hasFriendRequest(peer.id, me.id)
            ? 'incoming'
            : 'none',
    });
    this.send(call.caller, describe(caller, callee));
    this.send(call.callee, describe(callee, caller));
  }

  private endCall(call: Call, endedBy: string, reason: string) {
    if (!this.calls.has(call.id)) return;
    if (call.ringTimer) clearTimeout(call.ringTimer);
    this.calls.delete(call.id);
    if (this.userCall.get(call.caller) === call.id) this.userCall.delete(call.caller);
    if (this.userCall.get(call.callee) === call.id) this.userCall.delete(call.callee);
    if (call.state === 'active') this.store.endCall(call.id);
    if (call.kind === 'friend' && call.state === 'ringing' && ['no-answer', 'cancelled', 'unavailable'].includes(reason)) this.recordMissedCall(call);
    const peer = this.peerOf(call, endedBy);
    this.send(peer, { type: 'call.ended', callId: call.id, reason });
    if (reason === 'no-answer' || reason === 'unavailable' || reason === 'disconnected') {
      this.send(endedBy, { type: 'call.ended', callId: call.id, reason });
    }
  }

  private broadcastPresence(userId: string, online: boolean) {
    for (const friendId of this.store.friendIds(userId)) {
      this.send(friendId, { type: 'presence', userId, online });
    }
  }

  private scheduleOnlineBroadcast() {
    if (this.onlineTimer) return;
    this.onlineTimer = setTimeout(() => {
      this.onlineTimer = null;
      const payload = JSON.stringify({ type: 'online', count: this.onlineCount });
      for (const client of this.clients.values()) {
        if (client.socket.readyState === OPEN) client.socket.send(payload);
      }
    }, 1500);
    unref(this.onlineTimer);
  }
}

const REACTIONS = new Set(['wave', 'heart', 'laugh', 'clap', 'tea']);

function sanitizeEvent(value: unknown): Record<string, string | number> | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as Record<string, unknown>;
  if (event.kind === 'reaction' && typeof event.reaction === 'string' && REACTIONS.has(event.reaction)) {
    return { kind: 'reaction', reaction: event.reaction };
  }
  if (event.kind === 'topic' && typeof event.text === 'string' && event.text.length <= 200) {
    return { kind: 'topic', text: event.text, index: Number(event.index) || 0 };
  }
  if (event.kind === 'topic-close') return { kind: 'topic-close' };
  return null;
}
