import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../components/Button';
import { LanguageChip } from '../../components/LanguageChip';
import { OnboardingStep } from '../../components/OnboardingStep';
import { LANGUAGES } from '../../lib/languages';
import { useOnboarding } from '../../state/onboarding';

export default function LanguagesStep() {
  const languages = useOnboarding((s) => s.languages);
  const toggle = useOnboarding((s) => s.toggleLanguage);
  const sorted = [...LANGUAGES].sort((a, b) => Number(languages.includes(b.code)) - Number(languages.includes(a.code)));

  return (
    <OnboardingStep
      step={3}
      title="Which languages do you speak?"
      subtitle="We only match you with people who speak at least one of the same languages."
      footer={<Button label="Continue" icon="arrow-forward" onPress={() => router.push('/onboarding/photo')} disabled={!languages.length} />}
    >
      <View style={styles.chips}>
        {sorted.map((language) => (
          <LanguageChip key={language.code} code={language.code} selected={languages.includes(language.code)} onPress={() => toggle(language.code)} />
        ))}
      </View>
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
