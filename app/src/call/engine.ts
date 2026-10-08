import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { prepareCallAudio, releaseCallAudio, routeCallAudioToSpeaker } from '../../modules/call-audio/src';
import { api, normalizeUser, type IceServer, type PublicUser, type ReportReason } from '../lib/api';
import { clearCallNotification, notifyLocal } from '../lib/notifications';
import { realtime, type ServerMessage } from '../lib/realtime';
import { CameraError, createPeer, openCamera, type RtcCandidate, type RtcDescription, type RtcPeer, type RtcStream } from '../rtc';
import { useFriends } from '../state/friends';
import { randomTopic } from '../lib/topics';
import { useSession } from '../state/session';
import { useSettings } from '../state/settings';
import { closeDialog, toast } from '../state/ui';
import { startRinging, stopRinging } from './ringer';

export type CallPhase = 'idle' | 'preparing' | 'searching' | 'outgoing' | 'incoming' | 'connecting' | 'live' | 'ended';
export type CallKind = 'random' | 'friend';
export type Friendship = 'none' | 'requested' | 'incoming' | 'friends';
export type EndReason =
  | 'you-left'
  | 'hangup'
  | 'declined'
  | 'no-answer'
  | 'offline'
  | 'busy'
  | 'unavailable'
  | 'not-friends'
  | 'disconnected'
  | 'connection'
  | 'reported'
  | 'no-internet';

type CallState = {
  phase: CallPhase;
  callId: string | null;
  kind: CallKind | null;
  peer: PublicUser | null;
  initiator: boolean;
  sharedInterests: string[];
  friendship: Friendship;
  localStream: RtcStream | null;
  remoteStream: RtcStream | null;
  micOn: boolean;
  cameraOn: boolean;
  startedAt: number | null;
  endedAt: number | null;
  endReason: EndReason | null;
  peerReconnecting: boolean;
  mediaError: 'denied' | 'unavailable' | null;
  topic: { text: string; index: number; mine: boolean } | null;
  reaction: { id: number; kind: Reaction; mine: boolean } | null;
  ringingOffline: boolean;
};

export type Reaction = 'wave' | 'heart' | 'laugh' | 'clap';

const initialCall = {
  callId: null,
  kind: null,
  peer: null,
  initiator: false,
  sharedInterests: [],
  friendship: 'none' as Friendship,
  remoteStream: null,
  startedAt: null,
  endedAt: null,
  endReason: null,
  peerReconnecting: false,
  topic: null,
  reaction: null,
  ringingOffline: false,
};

let reactionId = 0;

export const useCall = create<CallState>(() => ({
  phase: 'idle',
  localStream: null,
  micOn: true,
  cameraOn: true,
  mediaError: null,
  ...initialCall,
}));

const get = useCall.getState;
const set = useCall.setState;

const DEFAULT_ICE: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

let iceServers: IceServer[] = DEFAULT_ICE;
let peer: RtcPeer | null = null;
let pendingCandidates: RtcCandidate[] = [];
let signalChain: Promise<void> = Promise.resolve();
let connectTimer: ReturnType<typeof setTimeout> | null = null;
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
let restartedIce = false;

function haptic(kind: 'success' | 'warning' | 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else void Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
}

export async function refreshIceServers() {
  try {
    const config = await api.config();
    if (Array.isArray(config.iceServers) && config.iceServers.length > 0) iceServers = config.iceServers;
  } catch {
    iceServers = iceServers.length ? iceServers : DEFAULT_ICE;
  }
}

async function ensureMedia(): Promise<boolean> {
  if (get().localStream) return true;
  prepareCallAudio();
  try {
    const stream = await openCamera(useSession.getState().user?.name ?? 'You');
    set({ localStream: stream, micOn: true, cameraOn: true, mediaError: null });
    return true;
  } catch (error) {
    set({ mediaError: error instanceof CameraError ? error.reason : 'unavailable' });
    return false;
  }
}

function releaseMedia() {
  if (get().localStream) releaseCallAudio();
  const stream = get().localStream;
  stream?.getTracks().forEach((track) => track.stop());
  set({ localStream: null, micOn: true, cameraOn: true });
}

function clearTimers() {
  if (connectTimer) clearTimeout(connectTimer);
  if (recoveryTimer) clearTimeout(recoveryTimer);
  connectTimer = null;
  recoveryTimer = null;
}

function teardownPeer() {
  clearTimers();
  const current = peer;
  peer = null;
  pendingCandidates = [];
  restartedIce = false;
  signalChain = Promise.resolve();
  if (current) {
    try {
      current.close();
    } catch {
      peer = null;
    }
  }
}

function sendSignal(data: Record<string, unknown>) {
  const callId = get().callId;
  if (callId) realtime.send({ type: 'signal', callId, data });
}

function finish(reason: EndReason, notifyServer: boolean) {
  const { callId, phase } = get();
  if (notifyServer && callId) {
    realtime.send({ type: phase === 'outgoing' ? 'call.cancel' : 'call.hangup', callId });
  }
  stopRinging();
  teardownPeer();
  releaseMedia();
  set({ phase: 'ended', endReason: reason, endedAt: Date.now(), remoteStream: null, peerReconnecting: false, topic: null, reaction: null });
  if (reason !== 'you-left') haptic('warning');
  void useFriends.getState().refresh();
}

function markLive() {
  if (get().phase !== 'connecting') return;
  clearTimers();
  set({ phase: 'live', startedAt: Date.now(), peerReconnecting: false });
  routeCallAudioToSpeaker();
  haptic('success');
}

function onConnectionChange() {
  const current = peer;
  if (!current) return;
  const state = current.connectionState;
  const ice = current.iceConnectionState;
  if (state === 'connected' || ice === 'connected' || ice === 'completed') {
    if (recoveryTimer) clearTimeout(recoveryTimer);
    recoveryTimer = null;
    if (get().phase === 'connecting') markLive();
    else set({ peerReconnecting: false });
    return;
  }
  if (get().phase !== 'live') return;
  if (state === 'failed' || ice === 'failed' || ice === 'disconnected') {
    set({ peerReconnecting: true });
    if ((state === 'failed' || ice === 'failed') && get().initiator && !restartedIce) {
      restartedIce = true;
      signalChain = signalChain.then(async () => {
        if (!peer) return;
        const offer = await peer.createOffer({ iceRestart: true });
        await peer.setLocalDescription(offer);
        sendSignal({ description: { type: offer.type, sdp: offer.sdp } });
      }).catch(() => {});
    }
    if (!recoveryTimer) {
      recoveryTimer = setTimeout(() => {
        recoveryTimer = null;
        if (get().phase === 'live' && get().peerReconnecting) finish('connection', true);
      }, 20000);
    }
  }
}

async function setupPeer(initiator: boolean) {
  const local = get().localStream;
  if (!local) return;
  const pc = createPeer(iceServers);
  peer = pc;
  local.getTracks().forEach((track) => pc.addTrack(track, local));
  pc.addEventListener('icecandidate', (event: { candidate?: RtcCandidate | null }) => {
    const candidate = event.candidate;
    if (!candidate || !candidate.candidate) return;
    sendSignal({ candidate: { candidate: candidate.candidate, sdpMid: candidate.sdpMid ?? null, sdpMLineIndex: candidate.sdpMLineIndex ?? null } });
  });
  pc.addEventListener('track', (event: { streams?: RtcStream[] }) => {
    const stream = event.streams?.[0];
    if (stream && peer === pc) set({ remoteStream: stream });
  });
  pc.addEventListener('connectionstatechange', onConnectionChange);
  pc.addEventListener('iceconnectionstatechange', onConnectionChange);
  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ description: { type: offer.type, sdp: offer.sdp } });
  }
}

async function handleSignal(data: { description?: RtcDescription; candidate?: RtcCandidate }) {
  const pc = peer;
  if (!pc) return;
  if (data.description) {
    await pc.setRemoteDescription(data.description);
    const queued = pendingCandidates;
    pendingCandidates = [];
    for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => {});
    if (data.description.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({ description: { type: answer.type, sdp: answer.sdp } });
    }
  } else if (data.candidate) {
    if (!pc.remoteDescription) pendingCandidates.push(data.candidate);
    else await pc.addIceCandidate(data.candidate).catch(() => {});
  }
}

export async function startMeeting() {
  const { phase } = get();
  if (phase !== 'idle' && phase !== 'ended') return;
  set({ phase: 'preparing', ...initialCall, mediaError: null });
  void refreshIceServers();
  const ok = await ensureMedia();
  if (get().phase !== 'preparing') return;
  if (!ok) {
    set({ phase: 'idle' });
    return;
  }
  set({ phase: 'searching' });
  haptic('light');
  realtime.send({ type: 'meet.start', verifiedOnly: wantsVerified() });
}

export function cancelSearch() {
  if (get().phase !== 'searching' && get().phase !== 'preparing') return;
  realtime.send({ type: 'meet.stop' });
  releaseMedia();
  set({ phase: 'idle', ...initialCall });
}

export async function callFriend(friend: PublicUser) {
  const { phase } = get();
  if (phase !== 'idle' && phase !== 'ended') return;
  set({ phase: 'preparing', ...initialCall, peer: friend, kind: 'friend', friendship: 'friends', mediaError: null });
  void refreshIceServers();
  const ok = await ensureMedia();
  if (get().phase !== 'preparing') return;
  if (!ok) {
    set({ phase: 'idle', ...initialCall });
    return;
  }
  if (!realtime.send({ type: 'call.ring', userId: friend.id })) {
    releaseMedia();
    set({ phase: 'ended', endReason: 'no-internet', endedAt: Date.now() });
    return;
  }
  set({ phase: 'outgoing' });
}

export function cancelOutgoing() {
  if (get().phase !== 'outgoing') return;
  const callId = get().callId;
  if (callId) realtime.send({ type: 'call.cancel', callId });
  releaseMedia();
  set({ phase: 'idle', ...initialCall });
}

export async function answerIncoming() {
  const { phase, callId } = get();
  if (phase !== 'incoming' || !callId) return;
  stopRinging();
  set({ phase: 'connecting' });
  void refreshIceServers();
  const ok = await ensureMedia();
  if (!ok) {
    realtime.send({ type: 'call.decline', callId });
    set({ phase: 'idle', ...initialCall });
    return;
  }
  realtime.send({ type: 'call.answer', callId });
}

export function declineIncoming() {
  const { phase, callId } = get();
  if (phase !== 'incoming') return;
  stopRinging();
  if (callId) realtime.send({ type: 'call.decline', callId });
  releaseMedia();
  set({ phase: 'idle', ...initialCall });
}

export function hangUp() {
  const { phase } = get();
  if (phase === 'connecting' || phase === 'live') finish('you-left', true);
}

export function dismissEnded() {
  if (get().phase !== 'ended') return;
  releaseMedia();
  set({ phase: 'idle', ...initialCall });
}

export function toggleMic() {
  const { localStream, micOn } = get();
  localStream?.getAudioTracks().forEach((track) => (track.enabled = !micOn));
  set({ micOn: !micOn });
}

export function toggleCamera() {
  const { localStream, cameraOn } = get();
  localStream?.getVideoTracks().forEach((track) => (track.enabled = !cameraOn));
  set({ cameraOn: !cameraOn });
}

export async function addPeerAsFriend() {
  const { peer: person, friendship } = get();
  if (!person || friendship === 'friends' || friendship === 'requested') return;
  const previous = friendship;
  set({ friendship: previous === 'incoming' ? 'friends' : 'requested' });
  haptic('light');
  try {
    const status = await useFriends.getState().sendRequest(person);
    if (get().peer?.id !== person.id) return;
    set({ friendship: status });
    if (status === 'friends') toast(`You and ${person.name} are now friends`, 'heart');
    else toast(`Friend request sent to ${person.name}`, 'paper-plane');
  } catch (error) {
    if (get().peer?.id === person.id) set({ friendship: previous });
    toast(error instanceof Error ? error.message : 'Something went wrong.', 'alert-circle');
  }
}

export async function reportPeer(reason: ReportReason) {
  const person = get().peer;
  if (!person) return;
  await api.report(person.id, reason);
  if (get().phase === 'connecting' || get().phase === 'live') finish('reported', false);
  else if (get().peer?.id === person.id) set({ endReason: 'reported' });
}

function handleMessage(message: ServerMessage) {
  const state = get();
  switch (message.type) {
    case 'hello': {
      if (state.phase === 'searching') realtime.send({ type: 'meet.start', verifiedOnly: wantsVerified() });
      if ((state.phase === 'connecting' || state.phase === 'live') && message.activeCallId !== state.callId) {
        finish('disconnected', false);
      }
      if (state.phase === 'outgoing' && !state.callId) finish('no-internet', false);
      return;
    }
    case 'call.ringing':
      if (state.phase === 'outgoing') set({ callId: String(message.callId), ringingOffline: message.offline === true });
      return;
    case 'call.incoming': {
      const callId = String(message.callId);
      const caller = normalizeUser(message.peer as PublicUser);
      if (state.callId === callId && (state.phase === 'incoming' || state.phase === 'connecting' || state.phase === 'live')) return;
      if (state.phase === 'idle' || state.phase === 'searching' || state.phase === 'ended' || state.phase === 'preparing') {
        closeDialog();
        if (state.phase === 'ended') releaseMedia();
        if (state.phase === 'searching') realtime.send({ type: 'meet.stop' });
        set({ phase: 'incoming', ...initialCall, callId, peer: caller, kind: 'friend', friendship: 'friends' });
        void startRinging();
        notifyLocal('calls', `${caller.name} is calling you`, 'Tap to open TeaTime and answer.', { type: 'call', callId, userId: caller.id });
      } else {
        realtime.send({ type: 'call.decline', callId });
      }
      return;
    }
    case 'call.start': {
      const callId = String(message.callId);
      const okPhases: CallPhase[] = ['searching', 'outgoing', 'connecting', 'incoming', 'preparing'];
      if (!okPhases.includes(state.phase)) {
        realtime.send({ type: 'call.hangup', callId });
        return;
      }
      stopRinging();
      clearCallNotification(callId);
      closeDialog();
      teardownPeer();
      const initiator = message.initiator === true;
      set({
        phase: 'connecting',
        callId,
        kind: message.kind === 'friend' ? 'friend' : 'random',
        peer: normalizeUser(message.peer as PublicUser),
        initiator,
        sharedInterests: Array.isArray(message.sharedInterests) ? (message.sharedInterests as string[]) : [],
        friendship: (message.friendship as Friendship) ?? 'none',
        remoteStream: null,
        startedAt: null,
        endReason: null,
        peerReconnecting: false,
        topic: null,
        reaction: null,
      });
      haptic('success');
      connectTimer = setTimeout(() => {
        if (get().phase === 'connecting' && get().callId === callId) finish('connection', true);
      }, 30000);
      signalChain = signalChain
        .then(async () => {
          if (!get().localStream && !(await ensureMedia())) {
            finish('you-left', true);
            return;
          }
          if (get().callId === callId && get().phase === 'connecting') await setupPeer(initiator);
        })
        .catch(() => finish('connection', true));
      return;
    }
    case 'signal': {
      if (message.callId !== state.callId) return;
      const data = message.data as { description?: RtcDescription; candidate?: RtcCandidate };
      signalChain = signalChain.then(() => handleSignal(data)).catch(() => {});
      return;
    }
    case 'call.ended': {
      if (message.callId !== state.callId) return;
      const reason = String(message.reason) as EndReason | 'cancelled';
      if (state.phase === 'incoming') {
        clearCallNotification(state.callId ?? '');
        stopRinging();
        releaseMedia();
        const name = state.peer?.name;
        set({ phase: 'idle', ...initialCall });
        if (name) toast(`You missed a call from ${name}`, 'call');
        return;
      }
      if (state.phase === 'outgoing' || state.phase === 'connecting' || state.phase === 'live') {
        finish(reason === 'cancelled' ? 'hangup' : reason, false);
      }
      return;
    }
    case 'call.unavailable': {
      if (state.phase !== 'outgoing' || state.peer?.id !== message.userId) return;
      finish(String(message.reason) as EndReason, false);
      return;
    }
    case 'call.event': {
      if (message.callId !== state.callId) return;
      const event = message.event as { kind: string; text?: string; index?: number; reaction?: Reaction };
      if (event.kind === 'topic' && event.text) set({ topic: { text: event.text, index: event.index ?? 0, mine: false } });
      if (event.kind === 'topic-close') set({ topic: null });
      if (event.kind === 'reaction' && event.reaction) {
        set({ reaction: { id: ++reactionId, kind: event.reaction, mine: false } });
        haptic('light');
      }
      return;
    }
    case 'peer.reconnecting':
      if (message.callId === state.callId) set({ peerReconnecting: true });
      return;
    case 'peer.reconnected':
      if (message.callId === state.callId) set({ peerReconnecting: false });
      return;
    case 'friend.request': {
      const from = message.user as PublicUser;
      if (state.peer?.id === from.id && state.phase !== 'idle') {
        if (state.friendship === 'none') set({ friendship: 'incoming' });
      } else {
        toast(`${from.name} would like to be your friend`, 'person-add');
      }
      return;
    }
    case 'friend.added': {
      const friend = message.user as PublicUser;
      if (state.peer?.id === friend.id && state.phase !== 'idle') {
        if (state.friendship !== 'friends') {
          set({ friendship: 'friends' });
          toast(`You and ${friend.name} are now friends`, 'heart');
        }
      }
      return;
    }
  }
}

realtime.subscribe(handleMessage);

function wantsVerified() {
  return useSettings.getState().verifiedOnly && !!useSession.getState().user?.ageVerified;
}

function sendEvent(event: Record<string, unknown>) {
  const callId = get().callId;
  if (callId && get().phase === 'live') realtime.send({ type: 'call.event', callId, event });
}

export function showTopic() {
  const next = randomTopic(get().topic?.index);
  set({ topic: { ...next, mine: true } });
  sendEvent({ kind: 'topic', text: next.text, index: next.index });
  haptic('light');
}

export function closeTopic() {
  set({ topic: null });
  sendEvent({ kind: 'topic-close' });
}

export function sendReaction(kind: Reaction) {
  set({ reaction: { id: ++reactionId, kind, mine: true } });
  sendEvent({ kind: 'reaction', reaction: kind });
  haptic('light');
}

export function clearReaction(id: number) {
  if (get().reaction?.id === id) set({ reaction: null });
}

export function resetCall() {
  stopRinging();
  teardownPeer();
  releaseMedia();
  set({ phase: 'idle', ...initialCall, mediaError: null });
}

export function clearMediaError() {
  set({ mediaError: null });
}
