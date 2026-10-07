import { Platform } from 'react-native';

type Listener = (on: boolean) => void;

function readParams(): URLSearchParams {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

const params = readParams();

export const isSimulator = params.get('sim') === '1';
export const simDevice = (params.get('device') ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 12);
export const simCameraMode: 'real' | 'demo' = params.get('camera') === 'demo' ? 'demo' : 'real';

let soundOn = !isSimulator || params.get('sound') === '1';
const soundListeners = new Set<Listener>();

if (isSimulator && typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const data = event.data as { type?: string; on?: boolean } | null;
    if (data?.type === 'teatime:sound' && typeof data.on === 'boolean') {
      soundOn = data.on;
      soundListeners.forEach((l) => l(soundOn));
    }
  });
}

export function isSimSoundOn() {
  return soundOn;
}

export function onSimSoundChange(listener: Listener) {
  soundListeners.add(listener);
  return () => {
    soundListeners.delete(listener);
  };
}

export function postToSimulator(message: Record<string, unknown>) {
  if (!isSimulator || typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ ...message, device: simDevice }, '*');
}
