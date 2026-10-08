import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Updates from 'expo-updates';
import { AppState, Linking, Platform } from 'react-native';
import { create } from 'zustand';
import { api } from '../lib/api';
import { isSimulator } from '../lib/sim';

type Kind = 'none' | 'quick' | 'install' | 'reinstall';
type Phase = 'idle' | 'downloading' | 'installing' | 'failed' | 'needs-store';

type UpdatesState = {
  kind: Kind;
  phase: Phase;
  progress: number;
  apkUrl: string | null;
  check(): Promise<void>;
  apply(): Promise<void>;
};

const CHECK_EVERY = 30 * 60 * 1000;
const APK_MIME = 'application/vnd.android.package-archive';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

let lastCheck = 0;
let checking = false;

export const canUpdate = Platform.OS !== 'web' && !isSimulator && Updates.isEnabled;

export const buildNumber = Number(Application.nativeBuildVersion ?? 0) || 0;

async function newerInstall(): Promise<string | null> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  const latest = await api.latestApp(Platform.OS).catch(() => null);
  if (!latest || !latest.url) return null;
  if (latest.runtimeVersion === Updates.runtimeVersion) return null;
  if (latest.build <= buildNumber) return null;
  return latest.url;
}

export const useUpdates = create<UpdatesState>((set, get) => ({
  kind: 'none',
  phase: 'idle',
  progress: 0,
  apkUrl: null,

  async check() {
    if (!canUpdate || checking || get().phase === 'downloading' || get().phase === 'installing') return;
    checking = true;
    lastCheck = Date.now();
    try {
      const apkUrl = await newerInstall();
      if (apkUrl) {
        set({ kind: Platform.OS === 'ios' ? 'reinstall' : 'install', apkUrl });
        return;
      }
      const result = await Updates.checkForUpdateAsync();
      set({ kind: result.isAvailable ? 'quick' : 'none', apkUrl: null });
    } catch {
      lastCheck = 0;
    } finally {
      checking = false;
    }
  },

  async apply() {
    const { kind, apkUrl, phase } = get();
    if (phase === 'downloading' || phase === 'installing') return;
    if (kind === 'reinstall' && apkUrl) {
      const link = encodeURIComponent(apkUrl);
      for (const store of ['sidestore', 'altstore']) {
        try {
          await Linking.openURL(`${store}://install?url=${link}`);
          set({ phase: 'idle' });
          return;
        } catch {
          continue;
        }
      }
      set({ phase: 'needs-store' });
      return;
    }
    set({ phase: 'downloading', progress: 0 });
    try {
      if (kind === 'quick') {
        const result = await Updates.fetchUpdateAsync();
        if (!result.isNew) {
          set({ kind: 'none', phase: 'idle' });
          return;
        }
        set({ phase: 'installing', progress: 1 });
        await Updates.reloadAsync();
        return;
      }
      if (kind === 'install' && apkUrl && FileSystem.cacheDirectory) {
        const target = `${FileSystem.cacheDirectory}TeaTime-update.apk`;
        await FileSystem.deleteAsync(target, { idempotent: true });
        const download = FileSystem.createDownloadResumable(apkUrl, target, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) set({ progress: totalBytesWritten / totalBytesExpectedToWrite });
        });
        const file = await download.downloadAsync();
        if (!file || file.status !== 200) throw new Error('download failed');
        set({ phase: 'installing', progress: 1 });
        const contentUri = await FileSystem.getContentUriAsync(file.uri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: FLAG_GRANT_READ_URI_PERMISSION,
          type: APK_MIME,
        });
        set({ phase: 'idle' });
        return;
      }
      set({ phase: 'idle' });
    } catch {
      set({ phase: 'failed' });
    }
  },
}));

export function watchForUpdates() {
  if (!canUpdate) return () => {};
  void useUpdates.getState().check();
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active' && Date.now() - lastCheck > CHECK_EVERY) void useUpdates.getState().check();
  });
  return () => subscription.remove();
}
