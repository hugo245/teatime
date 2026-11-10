import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { ServerSheet } from '../../components/ServerSheet';
import { serverUrl } from '../../lib/config';
import { useSession } from '../../state/session';
import { colors, radius, space } from '../../theme';

const POINTS = [
  'Have a friendly video chat with someone new',
  'Make friends and call them again any time',
  'Safe and simple, with big clear buttons',
];

export default function WelcomeScreen() {
  const notice = useSession((s) => s.notice);
  const [serverSheet, setServerSheet] = useState(false);

  return (
    <Screen
      footer={
        <>
          <Button
            label="Get started"
            icon="arrow-forward"
            onPress={() => (serverUrl() ? router.push('/onboarding/name') : setServerSheet(true))}
          />
          <Button label="How TeaTime works" variant="ghost" size="medium" onPress={() => router.push('/help')} />
        </>
      }
    >
      <View style={styles.top}>
        <Pressable onLongPress={() => setServerSheet(true)} delayLongPress={1500} accessible={false}>
          <Image source={require('../../../assets/splash-icon.png')} style={styles.logo} contentFit="contain" />
        </Pressable>
        <AppText variant="display" center accessibilityRole="header">
          Welcome to TeaTime
        </AppText>
        <AppText variant="body" color={colors.textMuted} center style={{ maxWidth: 340 }}>
          A warm place to meet new people and enjoy a good chat, face to face.
        </AppText>
      </View>

      {notice ? (
        <View style={styles.notice}>
          <Ionicons name="information-circle" size={24} color={colors.accent} />
          <AppText variant="body" style={{ flex: 1 }}>
            {notice}
          </AppText>
        </View>
      ) : null}

      <View style={styles.points}>
        {POINTS.map((text, i) => (
          <View key={text} style={styles.point}>
            <AppText variant="heading" color={colors.accent} style={styles.number}>
              {i + 1}
            </AppText>
            <AppText variant="body" style={{ flex: 1 }}>
              {text}
            </AppText>
          </View>
        ))}
      </View>

      <ServerSheet visible={serverSheet} onClose={() => setServerSheet(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    alignItems: 'center',
    gap: 8,
    paddingTop: space.sm,
  },
  logo: {
    width: 76,
    height: 76,
    marginBottom: 8,
  },
  points: {
    gap: 16,
    marginTop: space.xl,
  },
  number: {
    width: 24,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  notice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: 14,
    marginTop: space.xl,
  },
});
