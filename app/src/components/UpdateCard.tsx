import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useUpdates } from '../state/updates';
import { colors, radius } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';

export function UpdateCard() {
  const kind = useUpdates((s) => s.kind);
  const phase = useUpdates((s) => s.phase);
  const progress = useUpdates((s) => s.progress);
  const apply = useUpdates((s) => s.apply);

  if (kind === 'none') return null;

  const busy = phase === 'downloading' || phase === 'installing';
  const percent = Math.round(progress * 100);

  let detail = kind === 'install' ? 'Tap the button below. When your phone asks, tap Install.' : 'It only takes a moment.';
  if (phase === 'downloading') detail = kind === 'install' ? `Downloading the new version, ${percent}% done.` : 'Getting the new version ready.';
  if (phase === 'installing') detail = kind === 'install' ? 'Tap Install on the screen that opens. If your phone asks, allow TeaTime to install apps.' : 'TeaTime will open again in a moment.';
  if (phase === 'failed') detail = 'The update did not work this time. Please check your internet and try again.';

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name="sparkles" size={24} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }} accessibilityLiveRegion="polite">
          <AppText variant="bodyStrong">A new version of TeaTime is ready</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {detail}
          </AppText>
        </View>
      </View>
      {phase === 'downloading' && kind === 'install' ? (
        <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
          <View style={[styles.fill, { width: `${Math.max(4, percent)}%` }]} />
        </View>
      ) : null}
      <Button
        label={phase === 'failed' ? 'Try again' : 'Update App'}
        icon="download"
        size="medium"
        loading={busy}
        disabled={busy}
        onPress={() => void apply()}
        accessibilityHint="Downloads and installs the newest version of TeaTime"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    borderWidth: 2,
    borderColor: colors.primarySoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
});
