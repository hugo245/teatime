import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { api, type PublicUser } from '../lib/api';
import { firstName } from '../lib/format';
import { confirm, toast } from '../state/ui';
import { colors } from '../theme';

export default function BlockedScreen() {
  const [people, setPeople] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .blocked()
      .then(({ blocked }) => {
        setPeople(blocked);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Something went wrong.'));

  useEffect(() => {
    void load();
  }, []);

  const unblock = async (person: PublicUser) => {
    const ok = await confirm({
      title: `Unblock ${firstName(person.name)}?`,
      message: 'You may be matched with this person again.',
      confirmLabel: 'Unblock',
    });
    if (!ok) return;
    try {
      await api.unblock(person.id);
      setPeople((list) => (list ?? []).filter((p) => p.id !== person.id));
      toast(`${firstName(person.name)} is no longer blocked`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong.', 'alert-circle');
    }
  };

  return (
    <Screen back title="Blocked people" subtitle="People you block cannot call you and will never be matched with you.">
      {error ? (
        <AppText variant="body" color={colors.textMuted}>
          {error}
        </AppText>
      ) : people && people.length === 0 ? (
        <Card>
          <AppText variant="body" color={colors.textMuted} center>
            You have not blocked anyone.
          </AppText>
        </Card>
      ) : people ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {people.map((person, index) => (
            <View key={person.id} style={[styles.row, index < people.length - 1 && styles.divider]}>
              <Avatar name={person.name} photoUrl={person.photoUrl} size={52} />
              <AppText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                {person.name}
              </AppText>
              <Button label="Unblock" variant="secondary" size="small" onPress={() => unblock(person)} />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
