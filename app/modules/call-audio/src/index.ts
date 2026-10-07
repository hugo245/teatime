import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type CallAudioNative = {
  prepare(): void;
  routeToSpeakerIfNeeded(): void;
};

const native = Platform.OS === 'ios' ? requireOptionalNativeModule<CallAudioNative>('CallAudio') : null;

export function prepareCallAudio() {
  native?.prepare();
}

export function routeCallAudioToSpeaker() {
  native?.routeToSpeakerIfNeeded();
}
