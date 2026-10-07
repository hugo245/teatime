import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { languageName } from '../lib/languages';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

export function LanguageChip({ code, selected, onPress }: { code: string; selected?: boolean; onPress?: () => void }) {
  const fg = selected ? colors.white : colors.text;
  const chip = (
    <View style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? 'transparent' : colors.border }]}>
      {selected ? <Ionicons name="checkmark" size={20} color={fg} /> : null}
      <AppText variant="label" color={fg}>
        {languageName(code)}
      </AppText>
    </View>
  );
  if (!onPress) return chip;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      accessibilityLabel={languageName(code)}
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {chip}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
});
