import { useState } from 'react';
import { defaultServerUrl, serverUrl } from '../lib/config';
import { realtime } from '../lib/realtime';
import { useSettings } from '../state/settings';
import { colors } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Sheet } from './Overlays';
import { TextField } from './TextField';

export function ServerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const setServer = useSettings((s) => s.setServer);
  const [value, setValue] = useState(serverUrl());
  const [status, setStatus] = useState<string | null>(null);

  const save = async () => {
    const url = value.trim();
    setStatus('Checking...');
    try {
      const res = await fetch(url.replace(/\/+$/, '') + '/health');
      if (!res.ok) throw new Error();
      setServer(url);
      realtime.reconnectNow();
      setStatus('Connected');
      onClose();
    } catch {
      setStatus('Could not reach this server.');
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText variant="title">Server address</AppText>
      <AppText variant="caption" color={colors.textMuted}>
        Default: {defaultServerUrl() || 'not set'}
      </AppText>
      <TextField
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://teatime.example.com"
      />
      {status ? <AppText variant="caption" color={colors.textMuted}>{status}</AppText> : null}
      <Button label="Save" onPress={save} />
      <Button
        label="Use default"
        variant="secondary"
        onPress={() => {
          setServer('');
          setValue(defaultServerUrl());
          realtime.reconnectNow();
          onClose();
        }}
      />
    </Sheet>
  );
}
