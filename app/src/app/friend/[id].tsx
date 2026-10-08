import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { callFriend } from '../../call/engine';
import { ReportSheet } from '../../call/ReportSheet';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { InterestChip } from '../../components/Chip';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { languageName } from '../../lib/languages';
import { getItem, setItem } from '../../lib/storage';
import { api } from '../../lib/api';
import { firstName, timeAgo } from '../../lib/format';
import { useFriends } from '../../state/friends';
import { confirm, toast } from '../../state/ui';
import { colors, space } from '../../theme';

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const friend = useFriends((s) => s.friends.find((f) => f.id === id));
  const [reporting, setReporting] = useState(false);

  if (!friend) {
    return (
      <Screen back title="Friend">
        <AppText variant="body" color={colors.textMuted}>
          This person is no longer in your friends list.
        </AppText>
      </Screen>
    );
  }

  const name = firstName(friend.name);
  const canCall = !friend.busy;
  const status = friend.busy ? 'In a call right now' : friend.online ? 'Here now' : `Last here ${timeAgo(friend.lastSeen)}`;

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: `${name} will no longer be in your friends list. You can add each other again after another chat.`,
      confirmLabel: 'Remove friend',
      destructive: true,
    });
    if (!ok) return;
    try {
      await useFriends.getState().remove(friend);
      router.back();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong.', 'alert-circle');
    }
  };

  const block = async () => {
    const ok = await confirm({
      title: `Block ${name}?`,
      message: `${name} will not be able to call you, and you will never be matched again.`,
      confirmLabel: `Block ${name}`,
      destructive: true,
    });
    if (!ok) return;
    try {
      await useFriends.getState().block(friend);
      toast(`${name} has been blocked`, 'hand-left');
      router.back();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong.', 'alert-circle');
    }
  };

  return (
    <Screen back>
      <View style={styles.top}>
        <Avatar name={friend.name} photoUrl={friend.photoUrl} size={140} online={friend.online} />
        <AppText variant="display" center style={{ marginTop: 16 }}>
          {friend.name}
        </AppText>
        {friend.location ? (
          <AppText variant="body" color={colors.textMuted} center>
            {friend.location}
          </AppText>
        ) : null}
        {friend.ageVerified ? (
          <View style={{ marginTop: 8 }}>
            <VerifiedBadge age={friend.age} />
          </View>
        ) : null}
        <AppText variant="label" color={friend.online ? colors.online : colors.textMuted} center style={{ marginTop: 6 }}>
          {status}
        </AppText>
      </View>

      <View style={{ gap: space.md }}>
        <Button
          label={canCall ? `Video call ${name}` : `${name} is in another call`}
          icon="videocam"
          disabled={!canCall}
          onPress={() => callFriend(friend)}
        />
        <Button
          label={`Send ${name} a message`}
          icon="chatbubble"
          variant="soft"
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id: friend.id } })}
        />
      </View>
      {canCall && !friend.online ? (
        <AppText variant="caption" color={colors.textMuted} center style={{ marginTop: 8 }}>
          {name} is not in TeaTime right now. If you call, we will ring their phone.
        </AppText>
      ) : null}

      <Card style={{ marginTop: space.xl, gap: 6 }}>
        <View style={styles.historyRow}>
          <Ionicons name="time-outline" size={24} color={colors.primary} />
          <AppText variant="bodyStrong" style={{ flex: 1 }}>
            {friend.callCount === 0
              ? `You have not had a video chat with ${name} yet`
              : friend.callCount === 1
                ? `You have talked with ${name} once`
                : `You have talked with ${name} ${friend.callCount} times`}
          </AppText>
        </View>
        {friend.lastCallAt ? (
          <AppText variant="caption" color={colors.textMuted} style={{ marginLeft: 36 }}>
            Your last chat was {timeAgo(friend.lastCallAt)}
          </AppText>
        ) : null}
      </Card>

      <FriendNotes id={friend.id} name={name} />

      {friend.about || friend.languages.length || friend.interests.length ? (
        <Card style={{ marginTop: space.xl, gap: 14 }}>
          {friend.about ? (
            <View style={{ gap: 4 }}>
              <AppText variant="heading">About {name}</AppText>
              <AppText variant="body" color={colors.textMuted}>
                {friend.about}
              </AppText>
            </View>
          ) : null}
          {friend.languages.length ? (
            <View style={{ gap: 4 }}>
              <AppText variant="heading">{name} speaks</AppText>
              <AppText variant="body" color={colors.textMuted}>
                {friend.languages.map(languageName).join(', ')}
              </AppText>
            </View>
          ) : null}
          {friend.interests.length ? (
            <View style={{ gap: 10 }}>
              <AppText variant="heading">{name} enjoys</AppText>
              <View style={styles.chips}>
                {friend.interests.map((interest) => (
                  <InterestChip key={interest} id={interest} small />
                ))}
              </View>
            </View>
          ) : null}
        </Card>
      ) : null}

      <View style={{ marginTop: space.xxl, gap: 10 }}>
        <Button label="Remove friend" variant="secondary" size="medium" onPress={remove} />
        <Button label={`Block ${name}`} variant="dangerGhost" size="medium" onPress={block} />
        <Button label={`Report ${name}`} variant="dangerGhost" size="medium" onPress={() => setReporting(true)} />
      </View>

      <ReportSheet
        name={name}
        visible={reporting}
        onClose={() => setReporting(false)}
        onReport={async (reason) => {
          await api.report(friend.id, reason);
          useFriends.setState((s) => ({ friends: s.friends.filter((f) => f.id !== friend.id) }));
          toast(`Thank you. ${name} has been reported and blocked.`, 'shield-checkmark');
          router.back();
        }}
      />
    </Screen>
  );
}

function FriendNotes({ id, name }: { id: string; name: string }) {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void getItem(`notes:${id}`).then((value) => {
      setText(value ?? '');
      setLoaded(true);
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id]);

  const change = (value: string) => {
    setText(value);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void setItem(`notes:${id}`, value).then(() => setSaved(true));
    }, 600);
  };

  if (!loaded) return null;
  return (
    <Card style={{ marginTop: space.lg, gap: 10 }}>
      <AppText variant="heading">My notes about {name}</AppText>
      <TextField
        value={text}
        onChangeText={change}
        multiline
        maxLength={1000}
        placeholder={`For example: ${name} has a grandson called Tom and loves roses.`}
        hint={saved ? 'Saved. Only you can see these notes.' : 'Only you can see these notes.'}
        accessibilityLabel={`My notes about ${name}`}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  top: {
    alignItems: 'center',
    marginBottom: space.xl,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
