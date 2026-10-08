import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ChatMessage } from '../lib/api';
import { timeText } from '../lib/reminders';
import { formatSeconds, looksLikeScam, useReadAloud, useVoicePlayer } from '../lib/voice';
import { colors, radius } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Sheet } from './Overlays';

export function timeLabel(timestamp: number) {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return time;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'long' })} ${time}`;
}

export function TextBubble({ message, mine, seen, onReport }: { message: ChatMessage; mine: boolean; seen: boolean; onReport?: () => void }) {
  const speakingId = useReadAloud((s) => s.speakingId);
  const speaking = speakingId === message.id;
  const warn = !mine && looksLikeScam(message.text);
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <AppText variant="body" color={mine ? colors.white : colors.text} selectable>
          {message.text}
        </AppText>
      </View>
      <View style={styles.meta}>
        <AppText variant="caption" color={colors.textFaint}>
          {timeLabel(message.createdAt)}
          {seen ? '  Seen' : ''}
        </AppText>
        {!mine ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={speaking ? 'Stop reading' : 'Read this message aloud'}
            hitSlop={10}
            onPress={() => useReadAloud.getState().speak(message.id, message.text)}
            style={({ pressed }) => [styles.readAloud, speaking && styles.readAloudOn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name={speaking ? 'stop' : 'volume-high'} size={18} color={speaking ? colors.white : colors.primary} />
            <AppText variant="caption" color={speaking ? colors.white : colors.primary}>
              {speaking ? 'Stop' : 'Read aloud'}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {warn ? <ScamWarning onReport={onReport} /> : null}
    </View>
  );
}

function ScamWarning({ onReport }: { onReport?: () => void }) {
  return (
    <View style={styles.warning} accessibilityRole="alert">
      <View style={styles.warningTop}>
        <Ionicons name="warning" size={22} color="#8A4B08" />
        <AppText variant="bodyStrong" color="#8A4B08" style={{ flex: 1 }}>
          Be careful
        </AppText>
      </View>
      <AppText variant="caption" color="#6B3A06">
        Never send money, bank details or gift cards to someone you met online, even if they seem kind or say it is urgent.
      </AppText>
      {onReport ? (
        <Pressable accessibilityRole="button" onPress={onReport} hitSlop={8}>
          <AppText variant="label" color={colors.danger}>
            Report this message
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function VoiceBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const playing = useVoicePlayer((s) => s.playingId === message.id);
  const seconds = message.voice?.seconds ?? 0;
  const tint = mine ? colors.white : colors.primary;
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${playing ? 'Stop' : 'Play'} voice message, ${seconds} seconds`}
        onPress={() => message.voice && useVoicePlayer.getState().play(message.id, message.voice.url)}
        style={({ pressed }) => [styles.bubble, styles.voice, mine ? styles.bubbleMine : styles.bubbleTheirs, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.playButton, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : colors.primarySoft }]}>
          <Ionicons name={playing ? 'pause' : 'play'} size={26} color={tint} />
        </View>
        <View style={styles.wave}>
          {[10, 18, 26, 14, 22, 30, 16, 24, 12, 20, 28, 14].map((h, i) => (
            <View key={i} style={[styles.waveBar, { height: h, backgroundColor: tint, opacity: playing ? 1 : 0.55 }]} />
          ))}
        </View>
        <AppText variant="bodyStrong" color={tint}>
          {formatSeconds(seconds)}
        </AppText>
      </Pressable>
      <AppText variant="caption" color={colors.textFaint} style={{ marginHorizontal: 6 }}>
        Voice message, {timeLabel(message.createdAt)}
      </AppText>
    </View>
  );
}

export function PlanCard({
  message,
  mine,
  name,
  onCall,
  onCancel,
}: {
  message: ChatMessage;
  mine: boolean;
  name: string;
  onCall?: () => void;
  onCancel?: () => void;
}) {
  const at = message.plan?.at ?? 0;
  const cancelled = message.plan?.cancelled === true;
  const now = Date.now();
  const past = at + 2 * 60 * 60 * 1000 < now;
  const soon = !cancelled && at - 15 * 60 * 1000 <= now && !past;
  return (
    <View style={styles.planWrap}>
      <View style={[styles.plan, cancelled && { opacity: 0.6 }]}>
        <View style={styles.planTop}>
          <View style={styles.planIcon}>
            <Ionicons name="calendar" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{cancelled ? 'Call cancelled' : 'Video call planned'}</AppText>
            <AppText variant="body" color={colors.textMuted} style={cancelled && { textDecorationLine: 'line-through' }}>
              {timeText(at).replace(/^./, (c) => c.toUpperCase())}
            </AppText>
          </View>
        </View>
        <AppText variant="caption" color={colors.textMuted}>
          {mine ? `You planned this with ${name}.` : `${name} planned this with you.`} {cancelled || past ? '' : 'You both get a reminder.'}
        </AppText>
        {soon && onCall ? <Button label={`Call ${name} now`} icon="videocam" size="medium" onPress={onCall} /> : null}
        {!cancelled && !past && onCancel ? <Button label="Cancel this call" variant="ghost" size="small" onPress={onCancel} /> : null}
      </View>
    </View>
  );
}

export function MissedCall({ message, mine, name, onCall }: { message: ChatMessage; mine: boolean; name: string; onCall?: () => void }) {
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

const TIMES = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function hourLabel(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function PlanSheet({ visible, name, onClose, onPlan }: { visible: boolean; name: string; onClose: () => void; onPlan: (at: number) => Promise<void> }) {
  const days = useMemo(() => {
    const list: { label: string; date: Date }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      date.setHours(0, 0, 0, 0);
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString([], { weekday: 'long' });
      list.push({ label, date });
    }
    return list;
  }, [visible]);
  const [day, setDay] = useState(1);
  const [hour, setHour] = useState(15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = new Date(days[day]!.date);
  chosen.setHours(hour, 0, 0, 0);
  const inPast = chosen.getTime() <= Date.now() + 5 * 60 * 1000;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onPlan(chosen.getTime());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText variant="title" accessibilityRole="header">
        Plan a call with {name}
      </AppText>
      <AppText variant="body" color={colors.textMuted}>
        Pick a day and a time. You both get a reminder.
      </AppText>
      <AppText variant="bodyStrong">Day</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {days.map((d, i) => (
          <Choice key={d.label} label={d.label} selected={day === i} onPress={() => setDay(i)} />
        ))}
      </ScrollView>
      <AppText variant="bodyStrong">Time</AppText>
      <View style={styles.timeGrid}>
        {TIMES.map((h) => (
          <Choice key={h} label={hourLabel(h)} selected={hour === h} onPress={() => setHour(h)} />
        ))}
      </View>
      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
      <Button
        label={inPast ? 'Pick a later time' : `Plan for ${timeText(chosen.getTime())}`}
        icon="calendar"
        disabled={inPast}
        loading={saving}
        onPress={() => void save()}
      />
      <Button label="Cancel" variant="ghost" size="medium" onPress={onClose} />
    </Sheet>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && { opacity: 0.8 }]}
    >
      <AppText variant="label" color={selected ? colors.white : colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChatMenu({
  visible,
  name,
  onClose,
  onPlan,
  onReport,
  onBlock,
}: {
  visible: boolean;
  name: string;
  onClose: () => void;
  onPlan?: () => void;
  onReport: () => void;
  onBlock: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText variant="title" accessibilityRole="header">
        {name}
      </AppText>
      <View style={{ gap: 10 }}>
        {onPlan ? <Button label="Plan a video call" icon="calendar" variant="secondary" onPress={onPlan} /> : null}
        <Button label={`Report ${name}`} icon="flag" variant="secondary" onPress={onReport} />
        <Button label={`Block ${name}`} icon="hand-left" variant="dangerGhost" onPress={onBlock} />
      </View>
      <Button label="Close" variant="ghost" size="medium" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
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
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 6,
  },
  readAloud: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  readAloudOn: {
    backgroundColor: colors.primary,
  },
  warning: {
    marginTop: 4,
    padding: 14,
    gap: 6,
    borderRadius: 16,
    backgroundColor: '#FCEBD5',
    borderWidth: 1,
    borderColor: '#F0C98F',
  },
  warningTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  playButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
  },
  planWrap: {
    alignItems: 'center',
  },
  plan: {
    width: '92%',
    padding: 16,
    gap: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primarySoft,
  },
  planTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
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
  chips: {
    gap: 8,
    paddingVertical: 2,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    minWidth: 84,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
