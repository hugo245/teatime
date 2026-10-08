import { create } from 'zustand';
import { api, normalizeUser, setApiToken, setAuthFailureListener, type ProfileInput, type PublicUser } from '../lib/api';
import { realtime } from '../lib/realtime';
import { getJson, getSecret, removeItem, removeSecret, setJson, setSecret } from '../lib/storage';

type Status = 'loading' | 'signedOut' | 'signedIn';

type SessionState = {
  status: Status;
  user: PublicUser | null;
  showAge: boolean;
  justJoined: boolean;
  notice: string | null;
  load(): Promise<void>;
  register(profile: ProfileInput, photoBase64: string | null): Promise<void>;
  setUser(user: PublicUser, showAge?: boolean): void;
  checkAge(birthYear: number, estimatedAge: number, test?: boolean): Promise<{ verified: boolean; reason?: string }>;
  finishJoining(): void;
  updateProfile(patch: Partial<ProfileInput>): Promise<void>;
  setPhoto(base64: string): Promise<void>;
  removePhoto(): Promise<void>;
  deleteAccount(): Promise<void>;
  signOut(notice?: string | null): Promise<void>;
  clearNotice(): void;
};

const TOKEN_KEY = 'token';
const DEVICE_KEY = 'deviceId';
const USER_KEY = 'user';

function randomId() {
  const bytes = new Array(16).fill(0).map(() => Math.floor(Math.random() * 256));
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function deviceId() {
  const existing = await getSecret(DEVICE_KEY);
  if (existing) return existing;
  const id = randomId();
  await setSecret(DEVICE_KEY, id);
  return id;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  showAge: true,
  justJoined: false,
  notice: null,

  async load() {
    setAuthFailureListener((code) => {
      void get().signOut(
        code === 'banned'
          ? 'Your account was removed because it did not follow the community rules.'
          : 'Please set up your profile again.',
      );
    });
    realtime.onClose((reason) => {
      if (reason === 'banned') void get().signOut('Your account was removed because it did not follow the community rules.');
      if (reason === 'unauthorized') void get().signOut('Please set up your profile again.');
      if (reason === 'deleted') void get().signOut(null);
    });

    let token = await getSecret(TOKEN_KEY);
    if (!token) {
      const savedDevice = await getSecret(DEVICE_KEY);
      const restored = savedDevice ? await api.restore(savedDevice).catch(() => null) : null;
      if (!restored) {
        set({ status: 'signedOut' });
        return;
      }
      token = restored.token;
      await setSecret(TOKEN_KEY, token);
      await setJson(USER_KEY, restored.user);
    }
    setApiToken(token);
    const cached = await getJson<PublicUser>(USER_KEY);
    set({ status: 'signedIn', user: cached ? normalizeUser(cached) : null });
    realtime.start(token);
    api
      .me()
      .then(({ user, showAge }) => get().setUser(user, showAge))
      .catch(() => {});
  },

  async register(profile, photoBase64) {
    const { token, user } = await api.register({ ...profile, deviceId: await deviceId() });
    await setSecret(TOKEN_KEY, token);
    setApiToken(token);
    let finalUser = user;
    if (photoBase64) {
      try {
        finalUser = (await api.uploadPhoto(photoBase64)).user;
      } catch {
        finalUser = user;
      }
    }
    await setJson(USER_KEY, finalUser);
    set({ status: 'signedIn', user: finalUser, notice: null, justJoined: true, showAge: profile.showAge });
    realtime.start(token);
  },

  setUser(raw, showAge) {
    const user = normalizeUser(raw);
    set(showAge === undefined ? { user } : { user, showAge });
    void setJson(USER_KEY, user);
  },

  async updateProfile(patch) {
    const { user, showAge } = await api.updateMe(patch);
    get().setUser(user, showAge);
  },

  async checkAge(birthYear, estimatedAge, test = false) {
    const result = await api.ageCheck(birthYear, estimatedAge, test);
    get().setUser(result.user);
    return { verified: result.verified, reason: result.reason };
  },

  finishJoining() {
    set({ justJoined: false });
  },

  async setPhoto(base64) {
    const { user } = await api.uploadPhoto(base64);
    get().setUser(user);
  },

  async removePhoto() {
    const { user } = await api.deletePhoto();
    get().setUser(user);
  },

  async deleteAccount() {
    await api.deleteMe();
    await get().signOut(null);
  },

  async signOut(notice = null) {
    realtime.stop();
    setApiToken(null);
    await removeSecret(TOKEN_KEY);
    await removeItem(USER_KEY);
    set({ status: 'signedOut', user: null, notice });
  },

  clearNotice() {
    set({ notice: null });
  },
}));
