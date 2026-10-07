import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'danger' | 'soft' | 'ghost' | 'dangerGhost' | 'light';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: ComponentProps<typeof Ionicons>['name'];
  size?: 'large' | 'medium' | 'small';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

const palette: Record<Variant, { bg: string; pressed: string; text: string; border?: string }> = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, text: colors.white },
  secondary: { bg: colors.surface, pressed: colors.surfaceMuted, text: colors.text, border: colors.border },
  danger: { bg: colors.danger, pressed: colors.dangerPressed, text: colors.white },
  soft: { bg: colors.primarySoft, pressed: '#D3E5D9', text: colors.primary },
  ghost: { bg: 'transparent', pressed: colors.surfaceMuted, text: colors.primary },
  dangerGhost: { bg: 'transparent', pressed: colors.dangerSoft, text: colors.danger },
  light: { bg: 'rgba(255,255,255,0.16)', pressed: 'rgba(255,255,255,0.28)', text: colors.white },
};

const heights = { large: 64, medium: 54, small: 44 };

export function Button({ label, onPress, variant = 'primary', icon, size = 'large', disabled, loading, style, accessibilityHint }: Props) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: heights[size],
          paddingHorizontal: size === 'small' ? 16 : 24,
          backgroundColor: pressed ? p.pressed : p.bg,
          borderColor: p.border ?? 'transparent',
          borderWidth: p.border ? StyleSheet.hairlineWidth * 2 : 0,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.text} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={size === 'small' ? 20 : 24} color={p.text} /> : null}
          <AppText variant={size === 'small' ? 'label' : 'bodyStrong'} color={p.text} numberOfLines={2} center>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
