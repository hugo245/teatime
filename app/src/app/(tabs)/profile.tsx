import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { InterestChip } from '../../components/Chip';
import { ListRow } from '../../components/ListRow';
import { PhotoSheet } from '../../components/PhotoSheet';
import { Screen } from '../../components/Screen';
import { ServerSheet } from '../../components/ServerSheet';
import { UpdateCard } from '../../components/UpdateCard';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { languageName } from '../../lib/languages';
import { appVersion, serverUrl } from '../../lib/config';
import { useSession } from '../../state/session';
import { buildNumber } from '../../state/updates';
import { useSettings, type TextSize } from '../../state/settings';
import { alertMessage, confirm, toast } from '../../state/ui';
import { colors, fonts, radius, space } from '../../theme';

const SIZES: { id: TextSize; label: string; size: number }[] = [
  { id: 'normal', label: 'Normal', size: 18 },
  { id: 'large', label: 'Large', size: 22 },
  { id: 'larger', label: 'Largest', size: 26 },
];

export default function ProfileScreen() {
  const user = useSession((s) => s.user);
  const showAge = useSession((s) => s.showAge);
  const textSize = useSettings((s) => s.textSize);
  const setTextSize = useSettings((s) => s.setTextSize);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [serverSheet, setServerSheet] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!user) return <Screen title="Profile">{null}</Screen>;

  const deleteAccount = async () => {
    const ok = await confirm({
      title: 'Delete your account?',
      message: 'Your profile, photo and friends will be removed for good. This cannot be undone.',
      confirmLabel: 'Delete my account',
      destructive: true,
    });
    if (!ok) return;
    try {
      await useSession.getState().deleteAccount();
    } catch (e) {
      await alertMessage('Something went wrong', e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <Screen title="Profile">
      <UpdateCard />
      <Card style={styles.profileCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change your photo"
          onPress={() => setPhotoSheet(true)}
          style={({ pressed }) => [{ opacity: pressed || uploading ? 0.7 : 1 }]}
        >
          <Avatar name={user.name} photoUrl={user.photoUrl} size={128} />
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={20} color={colors.white} />
          </View>
        </Pressable>
        <AppText variant="title" center style={{ marginTop: 14 }}>
          {user.name}
        </AppText>
        {user.location ? (
          <AppText variant="body" color={colors.textMuted} center>
            {user.location}
          </AppText>
        ) : null}
        {user.ageVerified ? (
          <View style={{ marginTop: 8 }}>
            <VerifiedBadge age={user.age} />
          </View>
        ) : null}
        <Button
          label="Edit my profile"
          icon="create-outline"
          variant="soft"
          size="medium"
          onPress={() => router.push('/edit-profile')}
          style={{ alignSelf: 'stretch', marginTop: 16 }}
        />
      </Card>

      <Card style={{ gap: 16, marginTop: space.lg }}>
        <View style={{ gap: 4 }}>
          <AppText variant="heading">About me</AppText>
          <AppText variant="body" color={user.about ? colors.text : colors.textFaint}>
            {user.about || 'Tell people a little about yourself. Tap Edit my profile.'}
          </AppText>
        </View>
        <View style={{ gap: 4 }}>
          <AppText variant="heading">Languages</AppText>
          <AppText variant="body" color={user.languages.length ? colors.text : colors.textFaint}>
            {user.languages.length ? user.languages.map(languageName).join(', ') : 'Not chosen yet.'}
          </AppText>
        </View>
        <View style={{ gap: 10 }}>
          <AppText variant="heading">What I enjoy</AppText>
          {user.interests.length ? (
            <View style={styles.chips}>
              {user.interests.map((id) => (
                <InterestChip key={id} id={id} small />
              ))}
            </View>
          ) : (
            <AppText variant="body" color={colors.textFaint}>
              Nothing chosen yet.
            </AppText>
          )}
        </View>
      </Card>

      <AppText variant="heading" style={styles.sectionTitle}>
        Verified Age
      </AppText>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {user.ageVerified ? (
          <ListRow
            icon="eye-outline"
            label="Show my age to others"
            detail={showAge ? 'People see your age next to your badge' : 'People only see the badge'}
            last
            right={
              <Switch
                value={showAge}
                onValueChange={(value) => void useSession.getState().updateProfile({ showAge: value }).catch(() => toast('Something went wrong.', 'alert-circle'))}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.white}
                accessibilityLabel="Show my age to others"
              />
            }
          />
        ) : (
          <ListRow icon="shield-checkmark-outline" label="Get my Verified Age badge" detail="Takes less than a minute, no ID needed" onPress={() => router.push('/verify-age')} last />
        )}
      </Card>

      <AppText variant="heading" style={styles.sectionTitle}>
        Text size
      </AppText>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {SIZES.map((option) => {
          const selected = textSize === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option.label} text`}
              onPress={() => setTextSize(option.id)}
              style={[styles.segmentItem, selected && styles.segmentSelected]}
            >
              <AppText scale={false} style={{ fontFamily: fonts.heavy, fontSize: option.size, lineHeight: option.size + 6 }} color={selected ? colors.white : colors.text}>
                Aa
              </AppText>
              <AppText scale={false} variant="caption" color={selected ? colors.white : colors.textMuted}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppText variant="heading" style={styles.sectionTitle}>
        Help and settings
      </AppText>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ListRow icon="help-buoy-outline" label="Help and safety" detail="How TeaTime works and staying safe" onPress={() => router.push('/help')} />
        <ListRow icon="hand-left-outline" label="Blocked people" onPress={() => router.push('/blocked')} />
        <ListRow icon="document-text-outline" label="Privacy policy" onPress={() => void Linking.openURL(`${serverUrl()}/privacy`)} />
        <ListRow icon="trash-outline" label="Delete my account" danger onPress={deleteAccount} last />
      </Card>

      <Pressable
        onLongPress={() => setServerSheet(true)}
        delayLongPress={1500}
        accessibilityRole="text"
        style={{ marginTop: space.xl, paddingVertical: 8 }}
      >
        <AppText variant="caption" color={colors.textFaint} center>
          TeaTime version {appVersion}
          {buildNumber ? ` (build ${buildNumber})` : ''}
        </AppText>
      </Pressable>

      <PhotoSheet
        visible={photoSheet}
        onClose={() => setPhotoSheet(false)}
        onRemove={user.photoUrl ? () => void useSession.getState().removePhoto().catch(() => toast('Something went wrong.', 'alert-circle')) : undefined}
        onPicked={async (photo) => {
          setUploading(true);
          try {
            await useSession.getState().setPhoto(photo.base64);
            toast('Your photo has been updated');
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Something went wrong.', 'alert-circle');
          } finally {
            setUploading(false);
          }
        }}
      />
      <ServerSheet visible={serverSheet} onClose={() => setServerSheet(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    alignItems: 'center',
    paddingTop: 28,
  },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.white,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 6,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.border,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 10,
    borderRadius: radius.sm,
    minHeight: 76,
  },
  segmentSelected: {
    backgroundColor: colors.primary,
  },
});
