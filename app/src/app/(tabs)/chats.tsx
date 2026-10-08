import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import type { ChatMessage, PublicUser } from '../../lib/api';
import { firstName, timeAgo } from '../../lib/format';
import { useChats } from '../../state/chats';
import { useFriends } from '../../state/friends';
import { useSession } from '../../state/session';
import { colors, fonts, space } from '../../theme';

type Row = { user: PublicUser; online: boolean; last: ChatMessage | null; unread: number };

export default function ChatsScreen() {
  const chats = useChats((s) => s.chats);
  const loaded = useChats((s) => s.loaded);
  const friends = useFriends((s) => s.friends);
  const me = useSession((s) => s.user?.id);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void useChats.getState().refresh();
      void useFriends.getState().refresh();
    }, []),
  );

  const rows = useMemo<Row[]>(() => {
    const withChat = chats.map((c) => ({ user: c.user, online: friends.find((f) => f.id === c.user.id)?.online ?? c.online, last: c.last, unread: c.unread }));
    const ids = new Set(withChat.map((r) => r.user.id));
    const others = friends.filter((f) => !ids.has(f.id)).map((f) => ({ user: f, online: f.online, last: null, unread: 0 }));
    return [...withChat, ...others];
  }, [chats, friends]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([useChats.getState().refresh(), useFriends.getState().refresh()]);
    setRefreshing(false);
  };

  return (
    <Screen title="Chats" refreshing={refreshing} onRefresh={refresh}>
      {rows.length ? (
        <Card style={styles.list}>
          {rows.map((row, index) => (
            <ChatRow key={row.user.id} row={row} me={me} last={index === rows.length - 1} />
          ))}
        </Card>
      ) : loaded ? (
        <Card style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles" size={44} color={colors.primary} />
          </View>
          <AppText variant="title" center>
            No chats yet
          </AppText>
          <AppText variant="body" color={colors.textMuted} center>
            When you make a friend on TeaTime, you can send them messages here.
          </AppText>
          <Button label="Meet someone new" icon="cafe" onPress={() => router.navigate('/')} style={{ alignSelf: 'stretch' }} />
        </Card>
      ) : null}
    </Screen>
  );
}

function preview(row: Row, me: string | undefined) {
  if (!row.last) return `Say hello to ${firstName(row.user.name)}`;
  if (row.last.kind === 'missed-call') return row.last.from === me ? 'You called' : 'Missed call';
  return row.last.from === me ? `You: ${row.last.text}` : row.last.text;
}

function ChatRow({ row, me, last }: { row: Row; me: string | undefined; last: boolean }) {
  const unread = row.unread > 0;
  const missed = row.last?.kind === 'missed-call' && row.last.from !== me;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.user.name}. ${preview(row, me)}${unread ? `. ${row.unread} new` : ''}`}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: row.user.id } })}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      <Avatar name={row.user.name} photoUrl={row.user.photoUrl} size={60} online={row.online} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.topLine}>
          <AppText variant="heading" numberOfLines={1} style={{ flex: 1 }}>
            {row.user.name}
          </AppText>
          {row.last ? (
            <AppText variant="caption" color={unread ? colors.primary : colors.textFaint}>
              {timeAgo(row.last.createdAt)}
            </AppText>
          ) : null}
        </View>
        <View style={styles.topLine}>
          {missed ? <Ionicons name="call" size={16} color={colors.danger} /> : null}
          <AppText
            variant="body"
            numberOfLines={1}
            color={missed ? colors.danger : unread ? colors.text : colors.textMuted}
            style={[{ flex: 1 }, unread && { fontFamily: fonts.bold }]}
          >
            {preview(row, me)}
          </AppText>
          {unread ? (
            <View style={styles.badge}>
              <AppText scale={false} style={styles.badgeText} color={colors.white}>
                {row.unread > 9 ? '9+' : String(row.unread)}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
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
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fonts.heavy,
    fontSize: 14,
    lineHeight: 18,
  },
  empty: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 32,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
