import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { ServerSheet } from '../../components/ServerSheet';
import { serverUrl } from '../../lib/config';
import { useSession } from '../../state/session';
import { colors, radius, space } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const POINTS: { icon: IconName; text: string }[] = [
  { icon: 'videocam', text: 'Have a friendly video chat with someone new' },
  { icon: 'heart', text: 'Make friends and call them again any time' },
  { icon: 'shield-checkmark', text: 'Safe and simple, with big clear buttons' },
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

      <Image
        source={require('../../../assets/images/tea-for-two.png')}
        style={styles.illustration}
        contentFit="contain"
        accessible={false}
      />

      <View style={{ gap: 12 }}>
        {POINTS.map((point) => (
          <View key={point.text} style={styles.point}>
            <View style={styles.pointIcon}>
              <Ionicons name={point.icon} size={24} color={colors.primary} />
            </View>
            <AppText variant="bodyStrong" style={{ flex: 1 }}>
              {point.text}
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
  illustration: {
    width: '100%',
    aspectRatio: 1200 / 760,
    maxHeight: 128,
    marginVertical: space.lg,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pointIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
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
