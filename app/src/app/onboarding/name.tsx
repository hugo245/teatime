import { router } from 'expo-router';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { OnboardingStep } from '../../components/OnboardingStep';
import { TextField } from '../../components/TextField';
import { useOnboarding } from '../../state/onboarding';

export default function NameStep() {
  const saved = useOnboarding((s) => s.name);
  const [name, setName] = useState(saved);
  const [error, setError] = useState<string | null>(null);

  const next = () => {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) {
      setError('Please enter your first name.');
      return;
    }
    if (!/^[\p{L}\p{M}' .-]+$/u.test(clean)) {
      setError('Please use only letters in your name.');
      return;
    }
    useOnboarding.getState().set({ name: clean });
    router.push('/onboarding/place');
  };

  return (
    <OnboardingStep
      step={1}
      title="What is your first name?"
      subtitle="This is the name people will see when you talk."
      footer={<Button label="Continue" icon="arrow-forward" onPress={next} disabled={!name.trim()} />}
    >
      <TextField
        value={name}
        onChangeText={(text) => {
          setName(text);
          setError(null);
        }}
        placeholder="For example: Margaret"
        autoFocus
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="next"
        maxLength={30}
        onSubmitEditing={next}
        error={error}
        accessibilityLabel="Your first name"
      />
    </OnboardingStep>
  );
}
