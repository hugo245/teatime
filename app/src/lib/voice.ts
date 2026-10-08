import {
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type RecordingOptions,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { absoluteUrl } from './config';

export const MAX_VOICE_SECONDS = 120;

export const VOICE_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { ...RecordingPresets.HIGH_QUALITY.android, sampleRate: 22050 },
  ios: { ...RecordingPresets.HIGH_QUALITY.ios, sampleRate: 22050 },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

export async function prepareRecording() {
  const permission = await requestRecordingPermissionsAsync();
  if (!permission.granted) return false;
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => null);
  return true;
}

export async function finishRecording() {
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
}

export async function readRecording(uri: string): Promise<{ data: string; type: string }> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]+,/, ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { data, type: blob.type || 'audio/webm' };
  }
  const data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return { data, type: 'audio/mp4' };
}

type PlayerState = {
  playingId: number | null;
  play(id: number, url: string): void;
  stop(): void;
};

let player: AudioPlayer | null = null;

export const useVoicePlayer = create<PlayerState>((set, get) => ({
  playingId: null,
  play(id, url) {
    if (get().playingId === id) {
      get().stop();
      return;
    }
    get().stop();
    Speech.stop();
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
    const next = createAudioPlayer({ uri: absoluteUrl(url) ?? url });
    player = next;
    next.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish && player === next) get().stop();
    });
    next.play();
    set({ playingId: id });
  },
  stop() {
    const current = player;
    player = null;
    if (current) {
      try {
        current.pause();
        current.remove();
      } catch {
        player = null;
      }
    }
    if (get().playingId !== null) set({ playingId: null });
  },
}));

type SpeechState = { speakingId: number | null; speak(id: number, text: string): void; stop(): void };

export const useReadAloud = create<SpeechState>((set, get) => ({
  speakingId: null,
  speak(id, text) {
    if (get().speakingId === id) {
      get().stop();
      return;
    }
    useVoicePlayer.getState().stop();
    Speech.stop();
    set({ speakingId: id });
    Speech.speak(text, {
      rate: 0.9,
      onDone: () => {
        if (get().speakingId === id) set({ speakingId: null });
      },
      onStopped: () => {
        if (get().speakingId === id) set({ speakingId: null });
      },
      onError: () => set({ speakingId: null }),
    });
  },
  stop() {
    Speech.stop();
    set({ speakingId: null });
  },
}));

export function formatSeconds(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const SCAM_WORDS =
  /\b(money|bank|banking|account number|card number|credit card|debit card|gift ?cards?|itunes|google play|steam card|bitcoin|crypto|western union|moneygram|paypal|transfer|wire|loan|invest|investment|pin|password|iban|sort code|lend me|send me|cash|payment|pay me|emergency fund|customs fee|inheritance|lottery|prize)\b|[£$€]\s?\d/i;

export function looksLikeScam(text: string) {
  return SCAM_WORDS.test(text);
}
