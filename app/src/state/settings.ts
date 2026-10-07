import { create } from 'zustand';
import { setServerOverride } from '../lib/config';
import { getJson, setJson } from '../lib/storage';

export type TextSize = 'normal' | 'large' | 'larger';

export const TEXT_SCALE: Record<TextSize, number> = {
  normal: 1,
  large: 1.12,
  larger: 1.25,
};

type Persisted = { textSize: TextSize; serverOverride: string; verifiedOnly: boolean };

type SettingsState = Persisted & {
  loaded: boolean;
  load(): Promise<void>;
  setTextSize(size: TextSize): void;
  setServer(url: string): void;
  setVerifiedOnly(value: boolean): void;
};

const KEY = 'settings';

function pick(state: Persisted): Persisted {
  return { textSize: state.textSize, serverOverride: state.serverOverride, verifiedOnly: state.verifiedOnly };
}

export const useSettings = create<SettingsState>((set, get) => ({
  textSize: 'normal',
  serverOverride: '',
  verifiedOnly: false,
  loaded: false,
  async load() {
    const saved = await getJson<Partial<Persisted>>(KEY);
    const textSize = saved?.textSize && saved.textSize in TEXT_SCALE ? saved.textSize : 'normal';
    const serverOverride = saved?.serverOverride ?? '';
    setServerOverride(serverOverride);
    set({ textSize, serverOverride, verifiedOnly: saved?.verifiedOnly === true, loaded: true });
  },
  setTextSize(textSize) {
    set({ textSize });
    void setJson(KEY, { ...pick(get()), textSize });
  },
  setServer(url) {
    const serverOverride = url.trim().replace(/\/+$/, '');
    setServerOverride(serverOverride);
    set({ serverOverride });
    void setJson(KEY, { ...pick(get()), serverOverride });
  },
  setVerifiedOnly(verifiedOnly) {
    set({ verifiedOnly });
    void setJson(KEY, { ...pick(get()), verifiedOnly });
  },
}));

export function useTextScale() {
  return useSettings((s) => TEXT_SCALE[s.textSize]);
}
