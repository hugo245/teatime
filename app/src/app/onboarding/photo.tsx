import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { OnboardingStep } from '../../components/OnboardingStep';
import { choosePhoto } from '../../components/PhotoSheet';
import { useOnboarding } from '../../state/onboarding';
import { colors } from '../../theme';

export default function PhotoStep() {
  const name = useOnboarding((s) => s.name);
  const photo = useOnboarding((s) => s.photo);

  const pick = async (source: 'camera' | 'library') => {
    const picked = await choosePhoto(source);
    if (picked) useOnboarding.getState().set({ photo: picked });
  };

  return (
    <OnboardingStep
      step={4}
      title="Add a photo of yourself"
      subtitle="A friendly photo helps people recognise you. You can change it later."
      footer={
        photo ? (
          <>
            <Button label="Continue" icon="arrow-forward" onPress={() => router.push('/onboarding/interests')} />
            <Button label="Choose a different photo" variant="ghost" size="medium" onPress={() => pick('library')} />
          </>
        ) : (
          <Button label="Skip for now" variant="ghost" size="medium" onPress={() => router.push('/onboarding/interests')} />
        )
      }
    >
      <View style={styles.preview}>
        {photo ? (
          <Avatar name={name || 'You'} localUri={photo.uri} size={180} />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="person" size={84} color={colors.textFaint} />
          </View>
        )}
      </View>
      {!photo ? (
        <View style={{ gap: 12 }}>
          <Button label="Take a photo" icon="camera" onPress={() => pick('camera')} />
          <Button label="Choose from my photos" icon="images" variant="secondary" onPress={() => pick('library')} />
        </View>
      ) : null}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  preview: {
    alignItems: 'center',
    marginBottom: 28,
  },
  placeholder: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
});
