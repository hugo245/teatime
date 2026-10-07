import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { interestById } from '../lib/interests';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

type Props = {
  id: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'light' | 'dark';
  small?: boolean;
};

export function InterestChip({ id, selected, onPress, tone = 'light', small }: Props) {
  const interest = interestById(id);
  if (!interest) return null;
  const dark = tone === 'dark';
  const fg = dark ? colors.white : selected ? colors.white : colors.text;
  const bg = dark ? 'rgba(255,255,255,0.18)' : selected ? colors.primary : colors.surface;
  const content = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: bg,
          borderColor: dark || selected ? 'transparent' : colors.border,
          paddingVertical: small ? 6 : 10,
          paddingHorizontal: small ? 12 : 16,
        },
      ]}
    >
      <Ionicons name={selected && !dark ? 'checkmark' : interest.icon} size={small ? 16 : 20} color={fg} />
      <AppText variant={small ? 'caption' : 'label'} color={fg}>
        {interest.label}
      </AppText>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      accessibilityLabel={interest.label}
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
