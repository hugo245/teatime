import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

export function VerifiedBadge({ age, dark, small, center }: { age?: number | null; dark?: boolean; small?: boolean; center?: boolean }) {
  const label = age ? `Verified Age ${age}` : 'Verified Age';
  return (
    <View
      style={[styles.badge, dark ? styles.dark : styles.light, small && styles.small, center && { alignSelf: 'center' }]}
      accessibilityLabel={age ? `Verified Age, ${age} years old` : 'Verified Age'}
    >
      <Ionicons name="shield-checkmark" size={small ? 14 : 16} color={dark ? colors.white : colors.verified} />
      <AppText variant="caption" scale={!small} color={dark ? colors.white : colors.verified} style={small ? { fontSize: 13, lineHeight: 17 } : undefined}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  small: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  light: {
    backgroundColor: colors.verifiedSoft,
  },
  dark: {
    backgroundColor: 'rgba(80,140,230,0.55)',
  },
});
