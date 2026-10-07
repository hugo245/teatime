import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { OnboardingStep } from '../../components/OnboardingStep';
import { ApiError } from '../../lib/api';
import { useOnboarding } from '../../state/onboarding';
import { useSession } from '../../state/session';
import { colors } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const PROMISES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'happy', title: 'Be kind', text: 'Treat everyone with warmth and respect.' },
  { icon: 'sparkles', title: 'Keep it clean', text: 'Nothing you would not show at a family tea party.' },
  { icon: 'cash', title: 'Never ask for money', text: 'And never send money or bank details to anyone.' },
  { icon: 'flag', title: 'Report problems', text: 'If something feels wrong, tap Report. We will take care of it.' },
];

export default function RulesStep() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    const draft = useOnboarding.getState();
    setBusy(true);
    setError(null);
    try {
      await useSession
        .getState()
        .register({ name: draft.name, location: draft.location, about: '', interests: draft.interests }, draft.photo?.base64 ?? null);
      useOnboarding.getState().reset();
    } catch (e) {
      if (e instanceof ApiError && e.field === 'name') {
        setError(e.message);
        router.navigate('/onboarding/name');
      } else {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingStep
      step={5}
      title="Our promise to each other"
      subtitle="TeaTime is a friendly place. Everyone agrees to these simple rules."
      footer={
        <>
          {error ? (
            <AppText variant="body" color={colors.danger} center accessibilityLiveRegion="assertive">
              {error}
            </AppText>
          ) : null}
          <Button label="I agree, let's begin" icon="checkmark" loading={busy} onPress={finish} />
          <Button label="Read the full rules" variant="ghost" size="medium" onPress={() => router.push('/help')} />
        </>
      }
    >
      <Card style={{ gap: 18 }}>
        {PROMISES.map((promise) => (
          <View key={promise.title} style={styles.row}>
            <View style={styles.icon}>
              <Ionicons name={promise.icon} size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{promise.title}</AppText>
              <AppText variant="body" color={colors.textMuted}>
                {promise.text}
              </AppText>
            </View>
          </View>
        ))}
      </Card>
      <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 16 }}>
        By tapping I agree, you accept the TeaTime community rules and privacy policy. People who break the rules are removed.
      </AppText>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
