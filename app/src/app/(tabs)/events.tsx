import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { Avatar } from '../../components/Avatar';
import { api, type TeaEvent } from '../../lib/api';
import { firstName } from '../../lib/format';
import { scheduleEventReminders, syncEventReminders } from '../../lib/reminders';
import { toast } from '../../state/ui';
import { colors, radius, space } from '../../theme';

function when(event: TeaEvent) {
  const start = new Date(event.startsAt);
  const day = start.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const from = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!event.endsAt) return `${day}, ${from}`;
  const to = new Date(event.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${from} to ${to}`;
}

function goingText(event: TeaEvent) {
  const others = event.going - (event.attending ? 1 : 0);
  if (event.attending) {
    if (others === 0) return 'You are the first one coming';
    return others === 1 ? 'You and 1 other person are coming' : `You and ${others} other people are coming`;
  }
  if (event.going === 0) return 'Be the first to say you are coming';
  return event.going === 1 ? '1 person is coming' : `${event.going} people are coming`;
}

export default function EventsScreen() {
  const [events, setEvents] = useState<TeaEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.events();
      setEvents(list);
      setError(null);
      void syncEventReminders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const update = (event: TeaEvent) => setEvents((list) => list.map((e) => (e.id === event.id ? event : e)));

  return (
    <Screen
      title="Events"
      subtitle="Get together with other TeaTime members."
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      <View style={{ gap: space.lg }}>
        {events.map((event) => (
          <EventCard key={event.id} event={event} onChange={update} />
        ))}
        {loaded && !events.length && !error ? (
          <Card style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={colors.primary} />
            <AppText variant="title" center>
              No events right now
            </AppText>
            <AppText variant="body" color={colors.textMuted} center>
              New events will show up here. Please come back soon.
            </AppText>
          </Card>
        ) : null}
        {error && !events.length ? (
          <Card style={styles.empty}>
            <AppText variant="body" color={colors.textMuted} center>
              {error}
            </AppText>
            <Button label="Try again" icon="refresh" size="medium" onPress={() => void load()} />
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

function EventCard({ event, onChange }: { event: TeaEvent; onChange: (event: TeaEvent) => void }) {
  const [busy, setBusy] = useState(false);
  const start = new Date(event.startsAt);

  const toggle = async () => {
    setBusy(true);
    try {
      const updated = await api.attend(event.id, !event.attending);
      if (updated) {
        onChange(updated);
        void scheduleEventReminders(updated);
      }
      if (updated?.attending) toast(`See you at ${event.title}! We will remind you the day before.`, 'calendar');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong.', 'alert-circle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={styles.date} accessible={false}>
          <AppText variant="caption" color={colors.white} style={styles.month}>
            {start.toLocaleDateString([], { month: 'short' }).toUpperCase()}
          </AppText>
          <AppText variant="display" color={colors.white} style={styles.day}>
            {start.getDate()}
          </AppText>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="title" accessibilityRole="header">
            {event.title}
          </AppText>
          <View style={styles.line}>
            <Ionicons name="time-outline" size={20} color={colors.textMuted} />
            <AppText variant="body" color={colors.textMuted} style={{ flex: 1 }}>
              {when(event)}
            </AppText>
          </View>
          {event.location ? (
            <View style={styles.line}>
              <Ionicons name="location-outline" size={20} color={colors.textMuted} />
              <AppText variant="body" color={colors.textMuted} style={{ flex: 1 }}>
                {event.location}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
      {event.description ? <AppText variant="body">{event.description}</AppText> : null}
      <View style={styles.line}>
        <Ionicons name="people" size={20} color={colors.primary} />
        <AppText variant="label" color={colors.primary}>
          {goingText(event)}
        </AppText>
      </View>
      {event.people?.length ? (
        <View style={styles.people} accessibilityLabel={`Coming: ${event.people.map((p) => firstName(p.name)).join(', ')}`}>
          {event.people.map((person) => (
            <View key={person.id} style={styles.person}>
              <Avatar name={person.name} photoUrl={person.photoUrl} size={44} />
              <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                {firstName(person.name)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      <Button
        label={event.attending ? 'I am coming' : 'I will come'}
        icon={event.attending ? 'checkmark-circle' : 'hand-right'}
        variant={event.attending ? 'soft' : 'primary'}
        loading={busy}
        onPress={() => void toggle()}
        accessibilityHint={event.attending ? 'Tap to say you can no longer come' : 'Lets others know you are coming'}
      />
      {event.attending ? (
        <AppText variant="caption" color={colors.textMuted} center>
          We will remind you the day before and one hour before. Changed your mind? Tap the button again.
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
  },
  top: {
    flexDirection: 'row',
    gap: 16,
  },
  date: {
    width: 72,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  month: {
    letterSpacing: 1,
  },
  day: {
    lineHeight: 40,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  empty: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28,
  },
  people: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  person: {
    width: 56,
    alignItems: 'center',
    gap: 2,
  },
});
