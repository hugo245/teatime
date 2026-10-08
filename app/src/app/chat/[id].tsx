import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { callFriend, useCall } from '../../call/engine';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { ChatMenu, MissedCall, PlanCard, PlanSheet, TextBubble, VoiceBubble } from '../../components/ChatParts';
import { ReportSheet } from '../../call/ReportSheet';
import { api, type PublicUser } from '../../lib/api';
import { finishRecording, formatSeconds, MAX_VOICE_SECONDS, prepareRecording, readRecording, useReadAloud, useVoicePlayer, VOICE_OPTIONS } from '../../lib/voice';
import { firstName, timeAgo } from '../../lib/format';
import { useChats } from '../../state/chats';
import { useFriends } from '../../state/friends';
import { useSession } from '../../state/session';
import { useTextScale } from '../../state/settings';
import { confirm, toast } from '../../state/ui';
import { colors, fonts, radius, space } from '../../theme';

const QUICK_REPLIES = ['Hello!', 'How are you?', 'Shall we have a video call?', 'Talk to you soon!', 'Thank you for the chat!'];

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
  const [menu, setMenu] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useAudioRecorder(VOICE_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 250);
  const recordStart = useRef(0);

  useEffect(() => {
    if (!id) return;
    setFailed(false);
    useChats
      .getState()
      .open(id)
      .catch(() => setFailed(true));
    return () => {
      useChats.getState().close(id);
      useVoicePlayer.getState().stop();
      useReadAloud.getState().stop();
    };
  }, [id]);

  const recordedSeconds = recording ? Math.floor((recorderState.durationMillis || 0) / 1000) : 0;

  useEffect(() => {
    if (recording && recordedSeconds >= MAX_VOICE_SECONDS) void stopAndSend();
  }, [recording, recordedSeconds]);

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

  const startRecording = async () => {
    if (!user || sending) return;
    useVoicePlayer.getState().stop();
    useReadAloud.getState().stop();
    try {
      if (!(await prepareRecording())) {
        toast('Please allow TeaTime to use your microphone in Settings.', 'mic-off');
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStart.current = Date.now();
      setRecording(true);
    } catch {
      toast('We could not start the recording. Please try again.', 'alert-circle');
      await finishRecording();
    }
  };

  const cancelRecording = async () => {
    setRecording(false);
    try {
      await recorder.stop();
    } catch {
      setRecording(false);
    }
    await finishRecording();
  };

  async function stopAndSend() {
    if (!user || !recording) return;
    setRecording(false);
    const seconds = Math.max(1, Math.round((Date.now() - recordStart.current) / 1000));
    try {
      await recorder.stop();
      await finishRecording();
      if (seconds < 1 || !recorder.uri) return;
      setSending(true);
      const file = await readRecording(recorder.uri);
      await useChats.getState().sendVoice(user, file.data, Math.min(seconds, MAX_VOICE_SECONDS), file.type);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Your voice message was not sent. Please try again.', 'alert-circle');
    } finally {
      setSending(false);
    }
  }

  const report = async (reason: Parameters<typeof api.report>[1]) => {
    if (!user) return;
    await api.report(user.id, reason, 'chat');
    toast('Thank you. Our team will look at your report.', 'shield-checkmark');
    void useFriends.getState().refresh();
    void useChats.getState().refresh();
    if (router.canGoBack()) router.back();
    else router.replace('/chats');
  };

  const block = async () => {
    setMenu(false);
    if (!user) return;
    const ok = await confirm({
      title: `Block ${name}?`,
      message: `${name} will not be able to call you or send you messages. They are not told that you blocked them.`,
      confirmLabel: `Block ${name}`,
      destructive: true,
    });
    if (!ok) return;
    try {
      await useFriends.getState().block(user);
      toast(`${name} is blocked`, 'hand-left');
      void useChats.getState().refresh();
      if (router.canGoBack()) router.back();
      else router.replace('/chats');
    } catch {
      toast('Something went wrong. Please try again.', 'alert-circle');
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
        {user ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More options"
            onPress={() => setMenu(true)}
            hitSlop={8}
            style={({ pressed }) => [styles.moreButton, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="ellipsis-vertical" size={26} color={colors.text} />
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
          renderItem={({ item }) => {
            const mine = item.from === me?.id;
            if (item.kind === 'missed-call') return <MissedCall message={item} mine={mine} name={name} onCall={isFriend ? call : undefined} />;
            if (item.kind === 'voice') return <VoiceBubble message={item} mine={mine} />;
            if (item.kind === 'plan') {
              return (
                <PlanCard
                  message={item}
                  mine={mine}
                  name={name}
                  onCall={isFriend ? call : undefined}
                  onCancel={() => void useChats.getState().cancelPlan(item).catch(() => toast('Something went wrong. Please try again.', 'alert-circle'))}
                />
              );
            }
            return <TextBubble message={item} mine={mine} seen={item.id === lastSeenMine?.id && !!item.readAt} onReport={() => setReporting(true)} />;
          }}
        />
      )}

      {isFriend && recording ? (
        <View style={[styles.composer, styles.recordingBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.recordingInfo} accessibilityLiveRegion="polite">
            <View style={styles.recordDot} />
            <AppText variant="heading">Recording {formatSeconds(recordedSeconds)}</AppText>
          </View>
          <View style={styles.recordingButtons}>
            <Button label="Cancel" icon="trash" variant="secondary" size="medium" onPress={() => void cancelRecording()} style={{ flex: 1 }} />
            <Button label="Send" icon="send" size="medium" onPress={() => void stopAndSend()} style={{ flex: 1 }} />
          </View>
        </View>
      ) : isFriend ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {!text ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Plan a video call with ${name}`}
                onPress={() => setPlanning(true)}
                style={({ pressed }) => [styles.chip, styles.planChip, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="calendar" size={18} color={colors.white} />
                <AppText variant="label" color={colors.white}>
                  Plan a call
                </AppText>
              </Pressable>
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
            {text.trim() || sending ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                disabled={sending}
                onPress={() => void send(text)}
                style={({ pressed }) => [styles.send, pressed && { opacity: 0.8 }]}
              >
                {sending ? <ActivityIndicator color={colors.white} /> : <Ionicons name="send" size={26} color={colors.white} />}
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Record a voice message"
                onPress={() => void startRecording()}
                style={({ pressed }) => [styles.send, styles.mic, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="mic" size={28} color={colors.white} />
              </Pressable>
            )}
          </View>
        </View>
      ) : thread?.loaded ? (
        <View style={[styles.notice, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <AppText variant="body" color={colors.textMuted} center>
            You can only send messages to your friends.
          </AppText>
        </View>
      ) : null}

      <ChatMenu
        visible={menu}
        name={name}
        onClose={() => setMenu(false)}
        onPlan={
          isFriend
            ? () => {
                setMenu(false);
                setPlanning(true);
              }
            : undefined
        }
        onReport={() => {
          setMenu(false);
          setReporting(true);
        }}
        onBlock={() => void block()}
      />
      {user ? (
        <PlanSheet visible={planning} name={name} onClose={() => setPlanning(false)} onPlan={(at) => useChats.getState().planCall(user, at)} />
      ) : null}
      <ReportSheet
        name={name}
        visible={reporting}
        onClose={() => setReporting(false)}
        onReport={report}
        description={`What happened? The last messages in this chat are sent to the TeaTime team with your report, and ${name} will be blocked.`}
      />
    </KeyboardAvoidingView>
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
  moreButton: {
    width: 40,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  mic: {
    backgroundColor: colors.accent,
  },
  recordingBar: {
    paddingHorizontal: 16,
    gap: 12,
  },
  recordingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  recordDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.danger,
  },
  recordingButtons: {
    flexDirection: 'row',
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
