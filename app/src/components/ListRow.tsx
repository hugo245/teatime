import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { AppText } from './AppText';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  detail?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
  last?: boolean;
};

export function ListRow({ icon, label, detail, onPress, onLongPress, danger, right, last }: Props) {
  const tint = danger ? colors.danger : colors.primary;
  const content = (
    <>
      <View style={[styles.icon, { backgroundColor: danger ? colors.dangerSoft : colors.primarySoft }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <View style={[styles.body, !last && styles.divider]}>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" color={danger ? colors.danger : colors.text}>
            {label}
          </AppText>
          {detail ? (
            <AppText variant="caption" color={colors.textMuted}>
              {detail}
            </AppText>
          ) : null}
        </View>
        {right ?? (onPress ? <Ionicons name="chevron-forward" size={22} color={colors.textFaint} /> : null)}
      </View>
    </>
  );
  if (!onPress && !onLongPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={1500}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    minHeight: 68,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 14,
    paddingRight: 16,
    paddingVertical: 14,
    alignSelf: 'stretch',
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
