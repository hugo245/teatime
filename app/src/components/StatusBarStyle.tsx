import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { postToSimulator } from '../lib/sim';

export function StatusBarStyle({ style }: { style: 'light' | 'dark' }) {
  useEffect(() => {
    postToSimulator({ type: 'teatime:statusbar', style });
    return () => postToSimulator({ type: 'teatime:statusbar', style: 'dark' });
  }, [style]);
  return <StatusBar style={style} animated />;
}
