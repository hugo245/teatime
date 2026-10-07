import { ScrollView, StyleSheet, View } from 'react-native';
import type { PublicUser } from '../lib/api';
import { languageName } from '../lib/languages';
import { colors, space } from '../theme';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { InterestChip } from './Chip';
import { Sheet } from './Overlays';
import { VerifiedBadge } from './VerifiedBadge';

export function ProfileSheet({ user, visible, onClose }: { user: PublicUser | null; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible && !!user} onClose={onClose}>
      {user ? (
        <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 14 }}>
          <View style={styles.top}>
            <Avatar name={user.name} photoUrl={user.photoUrl} size={110} />
            <AppText variant="title" center>
              {user.name}
            </AppText>
            {user.location ? (
              <AppText variant="body" color={colors.textMuted} center>
                {user.location}
              </AppText>
            ) : null}
            {user.ageVerified ? <VerifiedBadge age={user.age} center /> : null}
          </View>
          {user.about ? (
            <View style={{ gap: 4 }}>
              <AppText variant="heading">About</AppText>
              <AppText variant="body">{user.about}</AppText>
            </View>
          ) : null}
          {user.languages.length ? (
            <View style={{ gap: 4 }}>
              <AppText variant="heading">Speaks</AppText>
              <AppText variant="body">{user.languages.map(languageName).join(', ')}</AppText>
            </View>
          ) : null}
          {user.interests.length ? (
            <View style={{ gap: 8 }}>
              <AppText variant="heading">Enjoys</AppText>
              <View style={styles.chips}>
                {user.interests.map((id) => (
                  <InterestChip key={id} id={id} small />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
      <Button label="Close" variant="secondary" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  top: {
    alignItems: 'center',
    gap: 6,
    marginBottom: space.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
