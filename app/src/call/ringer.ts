import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform, Vibration } from 'react-native';
import { isSimSoundOn, isSimulator } from '../lib/sim';

let player: AudioPlayer | null = null;
let vibrateTimer: ReturnType<typeof setInterval> | null = null;

export async function startRinging() {
  stopRinging();
  if (Platform.OS !== 'web') {
    Vibration.vibrate();
    vibrateTimer = setInterval(() => Vibration.vibrate(), 2500);
  }
  if (isSimulator && !isSimSoundOn()) return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    const next = createAudioPlayer(require('../../assets/sounds/ring.wav'));
    next.loop = true;
    next.volume = 1;
    next.play();
    player = next;
  } catch {
    player = null;
  }
}

export function stopRinging() {
  if (vibrateTimer) clearInterval(vibrateTimer);
  vibrateTimer = null;
  if (Platform.OS !== 'web') Vibration.cancel();
  const current = player;
  player = null;
  if (current) {
    try {
      current.pause();
      current.remove();
    } catch {
      return;
    }
  }
}
