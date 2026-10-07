import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { InterestChip } from '../../components/Chip';
import { OnboardingStep } from '../../components/OnboardingStep';
import { INTERESTS } from '../../lib/interests';
import { useOnboarding } from '../../state/onboarding';
import { colors } from '../../theme';

export default function InterestsStep() {
  const interests = useOnboarding((s) => s.interests);
  const toggle = useOnboarding((s) => s.toggleInterest);

  return (
    <OnboardingStep
      step={4}
      title="What do you enjoy?"
      subtitle="Tap a few things you like. We will tell you when you have something in common."
      footer={
        interests.length ? (
          <Button label="Continue" icon="arrow-forward" onPress={() => router.push('/onboarding/rules')} />
        ) : (
          <Button label="Skip this step" variant="ghost" size="medium" onPress={() => router.push('/onboarding/rules')} />
        )
      }
    >
      <View style={styles.chips}>
        {INTERESTS.map((interest) => (
          <InterestChip key={interest.id} id={interest.id} selected={interests.includes(interest.id)} onPress={() => toggle(interest.id)} />
        ))}
      </View>
      {interests.length >= 8 ? (
        <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 14 }}>
          You can choose up to 8.
        </AppText>
      ) : null}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
