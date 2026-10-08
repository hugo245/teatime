import { router } from 'expo-router';
import { create } from 'zustand';
import { api, normalizeUser, type ChatMessage, type ChatSummary, type PublicUser } from '../lib/api';
import { notifyLocal } from '../lib/notifications';
import { cancelPlanReminder, schedulePlanReminder } from '../lib/reminders';
import { realtime } from '../lib/realtime';
import { useSession } from './session';
import { toast } from './ui';

type Thread = { messages: ChatMessage[]; loaded: boolean; hasMore: boolean; user: PublicUser | null; friend: boolean };

type ChatsState = {
  chats: ChatSummary[];
  unread: number;
  loaded: boolean;
  threads: Record<string, Thread>;
  active: string | null;
  refresh(): Promise<void>;
  open(userId: string): Promise<void>;
  loadOlder(userId: string): Promise<void>;
  close(userId: string): void;
  send(user: PublicUser, text: string): Promise<void>;
  sendVoice(user: PublicUser, data: string, seconds: number, type: string): Promise<void>;
  planCall(user: PublicUser, at: number): Promise<void>;
  cancelPlan(message: ChatMessage): Promise<void>;
  reset(): void;
};

const emptyThread: Thread = { messages: [], loaded: false, hasMore: true, user: null, friend: true };

function upsert(list: ChatMessage[], message: ChatMessage) {
  if (list.some((m) => m.id === message.id)) return list;
  return [...list, message].sort((a, b) => a.id - b.id);
}

function totalUnread(chats: ChatSummary[]) {
  return chats.reduce((sum, chat) => sum + chat.unread, 0);
}

export const useChats = create<ChatsState>((set, get) => ({
  chats: [],
  unread: 0,
  loaded: false,
  threads: {},
  active: null,

  async refresh() {
    try {
      const data = await api.chats();
      set({ chats: data.chats, unread: data.unread, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  async open(userId) {
    set({ active: userId });
    const data = await api.chat(userId);
    set((state) => ({
      threads: {
        ...state.threads,
        [userId]: { messages: data.messages, loaded: true, hasMore: data.messages.length >= 60, user: data.user, friend: data.friend },
      },
    }));
    await markRead(userId);
  },

  async loadOlder(userId) {
    const thread = get().threads[userId];
    if (!thread?.hasMore || !thread.messages.length) return;
    const data = await api.chat(userId, thread.messages[0]!.id);
    set((state) => {
      const current = state.threads[userId] ?? emptyThread;
      const merged = data.messages.reduce(upsert, current.messages);
      return { threads: { ...state.threads, [userId]: { ...current, messages: merged, hasMore: data.messages.length >= 60 } } };
    });
  },

  close(userId) {
    if (get().active === userId) set({ active: null });
  },

  async send(user, text) {
    const { message } = await api.sendMessage(user.id, text);
    receive(message, user);
  },

  async sendVoice(user, data, seconds, type) {
    const { message } = await api.sendVoice(user.id, data, seconds, type);
    receive(message, user);
  },

  async planCall(user, at) {
    const { message } = await api.planCall(user.id, at);
    receive(message, user);
  },

  async cancelPlan(message) {
    const result = await api.cancelPlan(message.id);
    update(result.message);
  },

  reset() {
    set({ chats: [], unread: 0, loaded: false, threads: {}, active: null });
  },
}));

function update(message: ChatMessage) {
  const me = useSession.getState().user?.id;
  const otherId = message.from === me ? message.to : message.from;
  useChats.setState((state) => {
    const thread = state.threads[otherId];
    return {
      threads: thread
        ? { ...state.threads, [otherId]: { ...thread, messages: thread.messages.map((m) => (m.id === message.id ? message : m)) } }
        : state.threads,
      chats: state.chats.map((c) => (c.last.id === message.id ? { ...c, last: message } : c)),
    };
  });
  if (message.kind === 'plan' && message.plan?.cancelled) void cancelPlanReminder(message.id);
}

async function markRead(userId: string) {
  const chat = useChats.getState().chats.find((c) => c.user.id === userId);
  if (chat && chat.unread === 0) return;
  useChats.setState((state) => {
    const chats = state.chats.map((c) => (c.user.id === userId ? { ...c, unread: 0 } : c));
    return { chats, unread: totalUnread(chats) };
  });
  await api.markRead(userId).catch(() => null);
}

function receive(message: ChatMessage, other: PublicUser) {
  const me = useSession.getState().user?.id;
  const otherId = message.from === me ? message.to : message.from;
  const state = useChats.getState();
  const incoming = message.from !== me;
  const viewing = state.active === otherId;
  const thread = state.threads[otherId];
  const existing = state.chats.find((c) => c.user.id === otherId);
  const unreadBump = incoming && !viewing ? 1 : 0;
  const summary: ChatSummary = {
    user: normalizeUser(other),
    last: message,
    unread: (existing?.unread ?? 0) + unreadBump,
    friend: existing?.friend ?? true,
    online: existing?.online ?? false,
  };
  const chats = [summary, ...state.chats.filter((c) => c.user.id !== otherId)];
  useChats.setState({
    chats,
    unread: totalUnread(chats),
    threads: thread ? { ...state.threads, [otherId]: { ...thread, messages: upsert(thread.messages, message) } } : state.threads,
  });
  if (message.kind === 'plan') void schedulePlanReminder(message, otherId, other.name);
  if (!incoming) return;
  if (viewing) {
    void api.markRead(otherId).catch(() => null);
    return;
  }
  const missed = message.kind === 'missed-call';
  const title = missed ? `Missed call from ${other.name}` : other.name;
  const body = missed
    ? 'Tap to call back.'
    : message.kind === 'voice'
      ? 'Sent you a voice message'
      : message.kind === 'plan'
        ? 'Planned a video call with you'
        : message.text;
  notifyLocal('messages', title, body, { type: missed ? 'missed-call' : 'message', userId: otherId });
  toast(missed ? `You missed a call from ${other.name}` : `New message from ${other.name}`, missed ? 'call' : 'chatbubble', () =>
    router.push({ pathname: '/chat/[id]', params: { id: otherId } }),
  );
}

realtime.subscribe((message) => {
  switch (message.type) {
    case 'hello':
      void useChats.getState().refresh();
      return;
    case 'chat.message':
      receive(message.message as ChatMessage, message.user as PublicUser);
      return;
    case 'chat.update':
      update(message.message as ChatMessage);
      return;
    case 'chat.read': {
      const userId = String(message.userId);
      const at = Number(message.at) || Date.now();
      const thread = useChats.getState().threads[userId];
      if (!thread) return;
      useChats.setState((state) => ({
        threads: {
          ...state.threads,
          [userId]: { ...thread, messages: thread.messages.map((m) => (m.to === userId && !m.readAt ? { ...m, readAt: at } : m)) },
        },
      }));
      return;
    }
    case 'presence': {
      const userId = String(message.userId);
      useChats.setState((state) => ({ chats: state.chats.map((c) => (c.user.id === userId ? { ...c, online: message.online === true } : c)) }));
      return;
    }
  }
});
