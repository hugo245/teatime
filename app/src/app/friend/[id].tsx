import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { callFriend } from '../../call/engine';
import { ReportSheet } from '../../call/ReportSheet';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { InterestChip } from '../../components/Chip';
import { Screen } from '../../components/Screen';
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
  const canCall = friend.online && !friend.busy;
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
        <AppText variant="label" color={friend.online ? colors.online : colors.textMuted} center style={{ marginTop: 6 }}>
          {status}
        </AppText>
      </View>

      <Button
        label={canCall ? `Video call ${name}` : `${name} is not here right now`}
        icon="videocam"
        disabled={!canCall}
        onPress={() => callFriend(friend)}
      />
      {!canCall ? (
        <AppText variant="caption" color={colors.textMuted} center style={{ marginTop: 8 }}>
          You can call when you see the green dot next to {name}.
        </AppText>
      ) : null}

      {friend.about || friend.interests.length ? (
        <Card style={{ marginTop: space.xl, gap: 14 }}>
          {friend.about ? (
            <View style={{ gap: 4 }}>
              <AppText variant="heading">About {name}</AppText>
              <AppText variant="body" color={colors.textMuted}>
                {friend.about}
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

const styles = StyleSheet.create({
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
