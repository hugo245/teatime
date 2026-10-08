import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type CallAudioNative = {
  prepare(): void;
  routeToSpeakerIfNeeded(): void;
  release?(): void;
};

const native = Platform.OS === 'web' ? null : requireOptionalNativeModule<CallAudioNative>('CallAudio');

export function prepareCallAudio() {
  native?.prepare();
}

export function routeCallAudioToSpeaker() {
  native?.routeToSpeakerIfNeeded();
}

export function releaseCallAudio() {
  native?.release?.();
}
