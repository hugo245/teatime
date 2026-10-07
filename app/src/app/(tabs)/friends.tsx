import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { callFriend, startMeeting } from '../../call/engine';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ProfileSheet } from '../../components/ProfileSheet';
import { Screen } from '../../components/Screen';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import type { Friend, PublicUser } from '../../lib/api';
import { firstName, timeAgo } from '../../lib/format';
import { useFriends } from '../../state/friends';
import { toast } from '../../state/ui';
import { colors, radius, space } from '../../theme';

export default function FriendsScreen() {
  const { friends, requests, recent, refreshing, refresh, loaded, error } = useFriends();

  useFocusEffect(
    useCallback(() => {
      void useFriends.getState().refresh();
    }, []),
  );

  return (
    <Screen title="Friends" refreshing={refreshing && loaded} onRefresh={refresh}>
      <View style={{ gap: space.xxl }}>
        {requests.length ? (
          <Section title="Friend requests">
            {requests.map((request) => (
              <RequestCard key={request.user.id} user={request.user} />
            ))}
          </Section>
        ) : null}

        <Section title={friends.length ? 'Your friends' : undefined}>
          {friends.length ? (
            <Card style={styles.list}>
              {friends.map((friend, index) => (
                <FriendRow key={friend.id} friend={friend} last={index === friends.length - 1} />
              ))}
            </Card>
          ) : loaded || error ? (
            <EmptyFriends />
          ) : null}
        </Section>

        {recent.length ? (
          <Section title="People you met recently" subtitle="Enjoyed a chat? Add them as a friend so you can call again.">
            <Card style={styles.list}>
              {recent.map((person, index) => (
                <RecentRow key={person.user.id} user={person.user} metAt={person.metAt} requested={person.requested} last={index === recent.length - 1} />
              ))}
            </Card>
          </Section>
        ) : null}

        {error && !loaded ? (
          <AppText variant="body" color={colors.textMuted} center>
            {error}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

function Section({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.md }}>
      {title ? (
        <View style={{ gap: 2 }}>
          <AppText variant="heading" accessibilityRole="header">
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" color={colors.textMuted}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

function statusText(friend: Friend) {
  if (friend.busy) return { text: 'In a call', color: colors.accent };
  if (friend.online) return { text: 'Here now', color: colors.online };
  if (friend.lastCallAt) return { text: `Last chat ${timeAgo(friend.lastCallAt)}`, color: colors.textMuted };
  return { text: `Last here ${timeAgo(friend.lastSeen)}`, color: colors.textMuted };
}

function FriendRow({ friend, last }: { friend: Friend; last: boolean }) {
  const status = statusText(friend);
  const canCall = friend.online && !friend.busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${friend.name}, ${status.text}`}
      onPress={() => router.push({ pathname: '/friend/[id]', params: { id: friend.id } })}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      <Avatar name={friend.name} photoUrl={friend.photoUrl} size={60} online={friend.online} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="heading" numberOfLines={1}>
          {friend.name}
        </AppText>
        {friend.ageVerified ? <VerifiedBadge small /> : null}
        <AppText variant="caption" color={status.color}>
          {status.text}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={canCall ? `Video call ${friend.name}` : `${friend.name} is not available to call`}
        onPress={() => {
          if (canCall) void callFriend(friend);
          else toast(friend.busy ? `${firstName(friend.name)} is in another call` : `${firstName(friend.name)} is not here right now`, 'time');
        }}
        hitSlop={8}
        style={({ pressed }) => [styles.callButton, !canCall && styles.callButtonIdle, pressed && { opacity: 0.8 }]}
      >
        <Ionicons name="videocam" size={22} color={canCall ? colors.white : colors.textMuted} />
        <AppText variant="label" color={canCall ? colors.white : colors.textMuted}>
          Call
        </AppText>
      </Pressable>
    </Pressable>
  );
}

function RequestCard({ user }: { user: PublicUser }) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const { accept, remove } = useFriends.getState();
  return (
    <Card style={{ gap: 16 }}>
      <View style={styles.requestTop}>
        <Avatar name={user.name} photoUrl={user.photoUrl} size={64} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{user.name}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {user.location ? `${user.location}, would like to be your friend` : 'Would like to be your friend'}
          </AppText>
        </View>
      </View>
      <View style={styles.requestButtons}>
        <Button
          label="Not now"
          variant="secondary"
          size="medium"
          style={{ flex: 1 }}
          loading={busy === 'decline'}
          disabled={!!busy}
          onPress={async () => {
            setBusy('decline');
            try {
              await remove(user);
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Something went wrong.', 'alert-circle');
            } finally {
              setBusy(null);
            }
          }}
        />
        <Button
          label="Accept"
          icon="checkmark"
          size="medium"
          style={{ flex: 1 }}
          loading={busy === 'accept'}
          disabled={!!busy}
          onPress={async () => {
            setBusy('accept');
            try {
              await accept(user);
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Something went wrong.', 'alert-circle');
            } finally {
              setBusy(null);
            }
          }}
        />
      </View>
    </Card>
  );
}

function RecentRow({ user, metAt, requested, last }: { user: PublicUser; metAt: number; requested: boolean; last: boolean }) {
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`See ${user.name}'s profile`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }, pressed && { opacity: 0.7 }]}
      >
        <Avatar name={user.name} photoUrl={user.photoUrl} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {user.name}
          </AppText>
          {user.ageVerified ? <VerifiedBadge small /> : null}
          <AppText variant="caption" color={colors.textMuted}>
            You talked {timeAgo(metAt)}
          </AppText>
        </View>
      </Pressable>
      <ProfileSheet user={user} visible={open} onClose={() => setOpen(false)} />
      {requested ? (
        <View style={styles.sentTag}>
          <Ionicons name="checkmark" size={18} color={colors.primary} />
          <AppText variant="caption" color={colors.primary}>
            Sent
          </AppText>
        </View>
      ) : (
        <Button
          label="Add"
          icon="person-add"
          variant="soft"
          size="small"
          loading={sending}
          onPress={async () => {
            setSending(true);
            try {
              const status = await useFriends.getState().sendRequest(user);
              toast(status === 'friends' ? `You and ${firstName(user.name)} are now friends` : `Friend request sent to ${firstName(user.name)}`, status === 'friends' ? 'heart' : 'paper-plane');
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Something went wrong.', 'alert-circle');
            } finally {
              setSending(false);
            }
          }}
        />
      )}
    </View>
  );
}

function EmptyFriends() {
  return (
    <Card style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="people" size={40} color={colors.primary} />
      </View>
      <AppText variant="title" center>
        No friends yet
      </AppText>
      <AppText variant="body" color={colors.textMuted} center>
        When you meet someone you like, tap Add friend during your call. They will appear here so you can call them again.
      </AppText>
      <Button label="Meet someone new" icon="cafe" onPress={startMeeting} style={{ alignSelf: 'stretch', marginTop: 6 }} />
    </Card>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.online,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  callButtonIdle: {
    backgroundColor: colors.surfaceMuted,
  },
  requestTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  requestButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  sentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
  },
  empty: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
