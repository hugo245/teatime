import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { simDevice } from './sim';

const webPrefix = `teatime${simDevice ? `:${simDevice}` : ''}:`;

function webStore() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return webStore()?.getItem(webPrefix + key) ?? null;
  return AsyncStorage.getItem(key);
}

export async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    webStore()?.setItem(webPrefix + key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function removeItem(key: string) {
  if (Platform.OS === 'web') {
    webStore()?.removeItem(webPrefix + key);
    return;
  }
  await AsyncStorage.removeItem(key);
}

export async function getSecret(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function setSecret(key: string, value: string) {
  if (Platform.OS === 'web') return setItem(key, value);
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}

export async function removeSecret(key: string) {
  if (Platform.OS === 'web') return removeItem(key);
  await SecureStore.deleteItemAsync(key);
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJson(key: string, value: unknown) {
  await setItem(key, JSON.stringify(value));
}
