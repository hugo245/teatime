import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { InterestChip } from '../components/Chip';
import { LanguageChip } from '../components/LanguageChip';
import { LANGUAGES } from '../lib/languages';
import { PhotoSheet } from '../components/PhotoSheet';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { ApiError } from '../lib/api';
import { INTERESTS } from '../lib/interests';
import { useSession } from '../state/session';
import { toast } from '../state/ui';
import { colors, space } from '../theme';

export default function EditProfileScreen() {
  const user = useSession((s) => s.user);
  const [name, setName] = useState(user?.name ?? '');
  const [location, setLocation] = useState(user?.location ?? '');
  const [about, setAbout] = useState(user?.about ?? '');
  const [interests, setInterests] = useState<string[]>(user?.interests ?? []);
  const [languages, setLanguages] = useState<string[]>(user?.languages ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);

  if (!user) return null;

  const toggle = (id: string) =>
    setInterests((list) => (list.includes(id) ? list.filter((i) => i !== id) : list.length >= 8 ? list : [...list, id]));

  const save = async () => {
    if (!name.trim()) {
      setErrors({ name: 'Please enter your first name.' });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await useSession.getState().updateProfile({ name, location, about, interests, languages });
      toast('Your profile has been saved');
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.field) setErrors({ [e.field]: e.message });
      else toast(e instanceof Error ? e.message : 'Something went wrong.', 'alert-circle');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen back title="Edit profile" footer={<Button label="Save" icon="checkmark" loading={saving} onPress={save} />}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change your photo"
          onPress={() => setPhotoSheet(true)}
          style={styles.photo}
        >
          <Avatar name={name || user.name} photoUrl={user.photoUrl} size={110} />
          <AppText variant="label" color={colors.primary}>
            Change photo
          </AppText>
        </Pressable>

        <View style={{ gap: space.xl }}>
          <TextField label="First name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={30} error={errors.name} />
          <TextField
            label="Where you live"
            value={location}
            onChangeText={setLocation}
            autoCapitalize="words"
            maxLength={40}
            placeholder="For example: Leeds"
            error={errors.location}
          />
          <TextField
            label="About me"
            value={about}
            onChangeText={setAbout}
            multiline
            maxLength={200}
            placeholder="I love my garden and a good cup of tea."
            hint={`${about.length} of 200 letters`}
            error={errors.about}
          />
          <View style={{ gap: 12 }}>
            <AppText variant="label">Languages I speak</AppText>
            <View style={styles.chips}>
              {LANGUAGES.map((language) => (
                <LanguageChip
                  key={language.code}
                  code={language.code}
                  selected={languages.includes(language.code)}
                  onPress={() =>
                    setLanguages((list) =>
                      list.includes(language.code) ? list.filter((l) => l !== language.code) : list.length >= 6 ? list : [...list, language.code],
                    )
                  }
                />
              ))}
            </View>
          </View>
          <View style={{ gap: 12 }}>
            <AppText variant="label">What I enjoy</AppText>
            <View style={styles.chips}>
              {INTERESTS.map((interest) => (
                <InterestChip key={interest.id} id={interest.id} selected={interests.includes(interest.id)} onPress={() => toggle(interest.id)} />
              ))}
            </View>
          </View>
        </View>

        <PhotoSheet
          visible={photoSheet}
          onClose={() => setPhotoSheet(false)}
          onRemove={user.photoUrl ? () => void useSession.getState().removePhoto() : undefined}
          onPicked={async (photo) => {
            try {
              await useSession.getState().setPhoto(photo.base64);
              toast('Your photo has been updated');
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Something went wrong.', 'alert-circle');
            }
          }}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  photo: {
    alignItems: 'center',
    gap: 10,
    marginBottom: space.xl,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
