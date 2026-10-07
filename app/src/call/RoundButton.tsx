import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { colors } from '../theme';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
  color?: string;
  iconColor?: string;
  size?: number;
  disabled?: boolean;
  labelColor?: string;
};

export function RoundButton({ icon, label, onPress, color = 'rgba(255,255,255,0.18)', iconColor = colors.white, size = 68, disabled, labelColor = colors.white }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress?.();
      }}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
        <Ionicons name={icon} size={Math.round(size * 0.44)} color={iconColor} />
      </View>
      <AppText variant="label" color={labelColor} center numberOfLines={2} style={{ maxWidth: size + 28 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 8,
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
