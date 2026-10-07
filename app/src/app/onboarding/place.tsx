import { router } from 'expo-router';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { OnboardingStep } from '../../components/OnboardingStep';
import { TextField } from '../../components/TextField';
import { useOnboarding } from '../../state/onboarding';

export default function PlaceStep() {
  const saved = useOnboarding((s) => s.location);
  const [location, setLocation] = useState(saved);

  const next = (value: string) => {
    useOnboarding.getState().set({ location: value.trim().replace(/\s+/g, ' ') });
    router.push('/onboarding/photo');
  };

  return (
    <OnboardingStep
      step={2}
      title="Where do you live?"
      subtitle="Your town or village is a lovely way to start a conversation."
      footer={
        <>
          <Button label="Continue" icon="arrow-forward" onPress={() => next(location)} disabled={!location.trim()} />
          <Button label="Skip this step" variant="ghost" size="medium" onPress={() => next('')} />
        </>
      }
    >
      <TextField
        value={location}
        onChangeText={setLocation}
        placeholder="For example: Leeds"
        autoFocus
        autoCapitalize="words"
        textContentType="addressCity"
        returnKeyType="next"
        maxLength={40}
        onSubmitEditing={() => next(location)}
        accessibilityLabel="Where you live"
      />
    </OnboardingStep>
  );
}
