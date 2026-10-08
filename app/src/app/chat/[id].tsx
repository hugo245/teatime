import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { callFriend, useCall } from '../../call/engine';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import type { ChatMessage, PublicUser } from '../../lib/api';
import { firstName, timeAgo } from '../../lib/format';
import { useChats } from '../../state/chats';
import { useFriends } from '../../state/friends';
import { useSession } from '../../state/session';
import { useTextScale } from '../../state/settings';
import { toast } from '../../state/ui';
import { colors, fonts, radius, space } from '../../theme';

const QUICK_REPLIES = ['Hello!', 'How are you?', 'Shall we have a video call?', 'Talk to you soon!', 'Thank you for the chat!'];

function timeLabel(timestamp: number) {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return time;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'long' })} ${time}`;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.user);
  const thread = useChats((s) => (id ? s.threads[id] : undefined));
  const summary = useChats((s) => s.chats.find((c) => c.user.id === id));
  const friend = useFriends((s) => s.friends.find((f) => f.id === id));
  const phase = useCall((s) => s.phase);
  const scale = useTextScale();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    setFailed(false);
    useChats
      .getState()
      .open(id)
      .catch(() => setFailed(true));
    return () => useChats.getState().close(id);
  }, [id]);

  const user: PublicUser | null = friend ?? thread?.user ?? summary?.user ?? null;
  const name = user ? firstName(user.name) : '';
  const isFriend = !!friend || (thread?.friend ?? summary?.friend ?? false);
  const online = friend?.online ?? summary?.online ?? false;
  const messages = useMemo(() => [...(thread?.messages ?? [])].reverse(), [thread?.messages]);
  const lastSeenMine = useMemo(() => thread?.messages.filter((m) => m.from === me?.id && m.kind === 'text').at(-1), [thread?.messages, me?.id]);

  const send = async (value: string) => {
    const body = value.trim();
    if (!body || !user || sending) return;
    setSending(true);
    try {
      await useChats.getState().send(user, body);
      setText('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Your message was not sent. Please try again.', 'alert-circle');
    } finally {
      setSending(false);
    }
  };

  const call = () => {
    if (!user) return;
    if (phase !== 'idle' && phase !== 'ended') return;
    if (friend?.busy) {
      toast(`${name} is in another call`, 'time');
      return;
    }
    void callFriend(user);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/chats'))}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={30} color={colors.primary} />
        </Pressable>
        {user ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${user.name}, open profile`}
            disabled={!friend}
            onPress={() => router.push({ pathname: '/friend/[id]', params: { id: user.id } })}
            style={styles.who}
          >
            <Avatar name={user.name} photoUrl={user.photoUrl} size={48} online={online} />
            <View style={{ flex: 1 }}>
              <AppText variant="heading" numberOfLines={1}>
                {user.name}
              </AppText>
              <AppText variant="caption" color={online ? colors.online : colors.textMuted} numberOfLines={1}>
                {online ? 'Here now' : friend ? `Last here ${timeAgo(friend.lastSeen)}` : ' '}
              </AppText>
            </View>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {user && isFriend ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Video call ${user.name}`}
            onPress={call}
            hitSlop={8}
            style={({ pressed }) => [styles.callButton, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="videocam" size={26} color={colors.white} />
          </Pressable>
        ) : null}
      </View>

      {!thread?.loaded ? (
        <View style={styles.center}>
          {failed ? (
            <>
              <AppText variant="body" color={colors.textMuted} center>
                We could not load this chat.
              </AppText>
              <Button
                label="Try again"
                icon="refresh"
                size="medium"
                onPress={() => {
                  setFailed(false);
                  if (id) useChats.getState().open(id).catch(() => setFailed(true));
                }}
              />
            </>
          ) : (
            <ActivityIndicator size="large" color={colors.primary} />
          )}
        </View>
      ) : (
        <FlatList
          data={messages}
          inverted
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => id && void useChats.getState().loadOlder(id)}
          ListFooterComponent={
            !thread.hasMore || messages.length === 0 ? (
              <View style={styles.intro}>
                {user ? <Avatar name={user.name} photoUrl={user.photoUrl} size={88} /> : null}
                <AppText variant="body" color={colors.textMuted} center>
                  {messages.length === 0 ? `Say hello to ${name}! Your messages stay between the two of you.` : `This is the start of your chat with ${name}.`}
                </AppText>
              </View>
            ) : null
          }
          renderItem={({ item }) =>
            item.kind === 'missed-call' ? (
              <MissedCall message={item} mine={item.from === me?.id} name={name} onCall={isFriend ? call : undefined} />
            ) : (
              <Bubble message={item} mine={item.from === me?.id} seen={item.id === lastSeenMine?.id && !!item.readAt} />
            )
          }
        />
      )}

      {isFriend ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {!text ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
              {QUICK_REPLIES.map((reply) => (
                <Pressable
                  key={reply}
                  accessibilityRole="button"
                  accessibilityLabel={`Send: ${reply}`}
                  onPress={() => void send(reply)}
                  disabled={sending}
                  style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.primarySoft }]}
                >
                  <AppText variant="label" color={colors.primary}>
                    {reply}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Type a message"
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={1000}
              accessibilityLabel="Message"
              style={[styles.input, { fontSize: Math.round(20 * scale), lineHeight: Math.round(26 * scale) }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={!text.trim() || sending}
              onPress={() => void send(text)}
              style={({ pressed }) => [styles.send, (!text.trim() || sending) && styles.sendIdle, pressed && { opacity: 0.8 }]}
            >
              {sending ? <ActivityIndicator color={colors.white} /> : <Ionicons name="send" size={26} color={colors.white} />}
            </Pressable>
          </View>
        </View>
      ) : thread?.loaded ? (
        <View style={[styles.notice, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <AppText variant="body" color={colors.textMuted} center>
            You can only send messages to your friends.
          </AppText>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, mine, seen }: { message: ChatMessage; mine: boolean; seen: boolean }) {
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <AppText variant="body" color={mine ? colors.white : colors.text} selectable>
          {message.text}
        </AppText>
      </View>
      <AppText variant="caption" color={colors.textFaint} style={{ marginHorizontal: 6 }}>
        {timeLabel(message.createdAt)}
        {seen ? '  Seen' : ''}
      </AppText>
    </View>
  );
}

function MissedCall({ message, mine, name, onCall }: { message: ChatMessage; mine: boolean; name: string; onCall?: () => void }) {
  return (
    <View style={styles.missed}>
      <View style={styles.missedPill}>
        <Ionicons name={mine ? 'call-outline' : 'call'} size={20} color={mine ? colors.textMuted : colors.danger} />
        <AppText variant="label" color={mine ? colors.textMuted : colors.danger}>
          {mine ? `You called ${name}` : `Missed call from ${name}`}
        </AppText>
      </View>
      <AppText variant="caption" color={colors.textFaint}>
        {timeLabel(message.createdAt)}
      </AppText>
      {!mine && onCall ? <Button label="Call back" icon="videocam" size="small" variant="soft" onPress={onCall} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  who: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  callButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  list: {
    padding: space.page,
    gap: 14,
  },
  intro: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  bubbleRow: {
    maxWidth: '85%',
    gap: 4,
  },
  rowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  rowTheirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  missed: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  missedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  composer: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
    gap: 10,
  },
  quick: {
    paddingHorizontal: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.primarySoft,
    backgroundColor: colors.surface,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    minHeight: 56,
    maxHeight: 160,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    borderRadius: 28,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  send: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIdle: {
    backgroundColor: colors.textFaint,
  },
  notice: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
