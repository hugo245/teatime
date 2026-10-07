import { createElement, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { serverUrl } from '../lib/config';
import type { AgeCheckMessage } from './AgeCheckView';

export type { AgeCheckMessage } from './AgeCheckView';

export function AgeCheckView({ onMessage }: { onMessage: (message: AgeCheckMessage) => void }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = (event.data as { teatimeAgeCheck?: AgeCheckMessage } | null)?.teatimeAgeCheck;
      if (message) handler.current(message);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {createElement('iframe', {
        ref: frame,
        src: `${serverUrl()}/age-check/`,
        allow: 'camera',
        title: 'Age check camera',
        style: { border: 0, width: '100%', height: '100%', background: '#F7F3EE' },
      })}
    </View>
  );
}
