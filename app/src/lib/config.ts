import Constants from 'expo-constants';
import { Platform } from 'react-native';

let override = '';

export function setServerOverride(url: string) {
  override = url.trim().replace(/\/+$/, '');
}

export function defaultServerUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SERVER_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  const extra = Constants.expoConfig?.extra as { serverUrl?: string } | undefined;
  return (extra?.serverUrl ?? '').replace(/\/+$/, '');
}

export function serverUrl(): string {
  return override || defaultServerUrl();
}

export function socketUrl(): string {
  return serverUrl().replace(/^http/, 'ws') + '/ws';
}

export function absoluteUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return serverUrl() + path;
}

export const appVersion = Constants.expoConfig?.version ?? '1.0.0';
