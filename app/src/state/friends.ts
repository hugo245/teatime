import { create } from 'zustand';
import { api, type FriendsPayload, type PublicUser } from '../lib/api';
import { realtime } from '../lib/realtime';
import { toast } from './ui';

type FriendsState = FriendsPayload & {
  loaded: boolean;
  refreshing: boolean;
  error: string | null;
  refresh(): Promise<void>;
  accept(user: PublicUser): Promise<void>;
  sendRequest(user: PublicUser): Promise<'requested' | 'friends'>;
  remove(user: PublicUser): Promise<void>;
  block(user: PublicUser): Promise<void>;
  reset(): void;
};

const empty: FriendsPayload = { friends: [], requests: [], recent: [] };

export const useFriends = create<FriendsState>((set, get) => ({
  ...empty,
  loaded: false,
  refreshing: false,
  error: null,

  async refresh() {
    if (get().refreshing) return;
    set({ refreshing: true });
    try {
      const data = await api.friends();
      set({ ...data, loaded: true, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Something went wrong.' });
    } finally {
      set({ refreshing: false });
    }
  },

  async accept(user) {
    const status = await get().sendRequest(user);
    if (status === 'friends') toast(`You and ${user.name} are now friends`, 'heart');
  },

  async sendRequest(user) {
    const { status } = await api.addFriend(user.id);
    set((state) => ({
      recent: state.recent.map((r) => (r.user.id === user.id ? { ...r, requested: true } : r)),
      requests: status === 'friends' ? state.requests.filter((r) => r.user.id !== user.id) : state.requests,
    }));
    void get().refresh();
    return status;
  },

  async remove(user) {
    await api.removeFriend(user.id);
    set((state) => ({
      friends: state.friends.filter((f) => f.id !== user.id),
      requests: state.requests.filter((r) => r.user.id !== user.id),
    }));
    void get().refresh();
  },

  async block(user) {
    await api.block(user.id);
    set((state) => ({
      friends: state.friends.filter((f) => f.id !== user.id),
      requests: state.requests.filter((r) => r.user.id !== user.id),
      recent: state.recent.filter((r) => r.user.id !== user.id),
    }));
  },

  reset() {
    set({ ...empty, loaded: false, error: null });
  },
}));

realtime.subscribe((message) => {
  const state = useFriends.getState();
  switch (message.type) {
    case 'hello':
    case 'friends.changed':
    case 'friend.request':
    case 'friend.added':
      void state.refresh();
      return;
    case 'presence': {
      const userId = String(message.userId);
      const online = message.online === true;
      useFriends.setState({
        friends: state.friends.map((f) => (f.id === userId ? { ...f, online, lastSeen: online ? f.lastSeen : Date.now() } : f)),
      });
      return;
    }
  }
});
