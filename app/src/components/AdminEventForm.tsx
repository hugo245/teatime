import { useEffect, useState } from 'react';
import { Text, TextInput, Pressable, View } from 'react-native';
import { serverUrl } from '../lib/config';
import { getItem, setItem } from '../lib/storage';

// Testing tool for creating events. Intentionally plain.
export function AdminEventForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    void getItem('adminToken').then((t) => t && setToken(t));
  }, []);

  const submit = async () => {
    setResult('sending...');
    try {
      const res = await fetch(`${serverUrl()}/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.trim()}` },
        body: JSON.stringify({ title, startsAt, endsAt: endsAt || undefined, location, description }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string; message?: string };
      if (!res.ok) {
        setResult(`error ${res.status}: ${data.message ?? data.error ?? 'failed'}`);
        return;
      }
      await setItem('adminToken', token.trim());
      setResult(`created ${data.id ?? ''}`);
      setTitle('');
      setDescription('');
      onCreated();
    } catch (e) {
      setResult(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)}>
        <Text>[admin] create event</Text>
      </Pressable>
    );
  }

  const field = (label: string, value: string, set: (v: string) => void, secure = false) => (
    <View>
      <Text>{label}</Text>
      <TextInput value={value} onChangeText={set} secureTextEntry={secure} autoCapitalize="none" style={{ borderWidth: 1 }} />
    </View>
  );

  return (
    <View>
      <Text>server: {serverUrl()}</Text>
      {field('admin token', token, setToken, true)}
      {field('title', title, setTitle)}
      {field('starts at (2026-11-15T15:00:00+01:00)', startsAt, setStartsAt)}
      {field('ends at (optional)', endsAt, setEndsAt)}
      {field('location', location, setLocation)}
      {field('description', description, setDescription)}
      <Pressable onPress={() => void submit()}>
        <Text>[create]</Text>
      </Pressable>
      <Pressable onPress={() => setOpen(false)}>
        <Text>[close]</Text>
      </Pressable>
      {result ? <Text>{result}</Text> : null}
    </View>
  );
}
