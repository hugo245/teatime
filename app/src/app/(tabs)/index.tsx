import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, type ComponentProps } from 'react';
import { router } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { callFriend, clearMediaError, startMeeting, useCall } from '../../call/engine';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { UpdateCard } from '../../components/UpdateCard';
import { firstName, greeting } from '../../lib/format';
import { useConnection } from '../../lib/realtime';
import { useFriends } from '../../state/friends';
import { useSession } from '../../state/session';
import { useSettings } from '../../state/settings';
import { colors, radius, space } from '../../theme';

export default function MeetScreen() {
  const insets = useSafeAreaInsets();
  const user = useSession((s) => s.user);
  const online = useConnection((s) => s.online);
  const status = useConnection((s) => s.status);
  const mediaError = useCall((s) => s.mediaError);
  const friends = useFriends((s) => s.friends);
  const onlineFriends = useMemo(() => friends.filter((f) => f.online && !f.busy), [friends]);
  const others = Math.max(0, online - 1);
  const verifiedOnly = useSettings((s) => s.verifiedOnly);
  const setVerifiedOnly = useSettings((s) => s.setVerifiedOnly);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="body" color={colors.textMuted}>
            {greeting()},
          </AppText>
          <AppText variant="display" accessibilityRole="header">
            {user ? firstName(user.name) : 'Welcome'}
          </AppText>
        </View>

        <UpdateCard />

        <Card style={styles.hero}>
          <Image
            source={require('../../../assets/images/tea-for-two.png')}
            style={styles.illustration}
            contentFit="contain"
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          <AppText variant="title" center>
            Ready for a chat?
          </AppText>
          <AppText variant="body" color={colors.textMuted} center>
            Meet a friendly person for a video chat. You can say goodbye at any time.
          </AppText>

          {status === 'online' ? (
            <View style={styles.onlinePill} accessibilityLiveRegion="polite">
              <View style={styles.onlineDot} />
              <AppText variant="label" color={colors.primary}>
                {others === 0 ? 'You are the first one here' : others === 1 ? '1 other person is here now' : `${others} people are here now`}
              </AppText>
            </View>
          ) : null}

          <Button
            label="Meet someone new"
            icon="videocam"
            onPress={startMeeting}
            style={{ alignSelf: 'stretch', marginTop: 4 }}
            accessibilityHint="Starts a video chat with a friendly person"
          />
        </Card>

        <Card style={styles.prefCard}>
          <View style={styles.prefRow}>
            <View style={styles.prefIcon}>
              <Ionicons name="shield-checkmark" size={24} color={colors.verified} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong">Only meet people with Verified Age</AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {user?.ageVerified
                  ? verifiedOnly
                    ? 'You will only meet people who checked their age.'
                    : 'Turn this on to only meet people who checked their age.'
                  : 'Get your own Verified Age badge to use this.'}
              </AppText>
            </View>
            {user?.ageVerified ? (
              <Switch
                value={verifiedOnly}
                onValueChange={setVerifiedOnly}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.white}
                accessibilityLabel="Only meet people with Verified Age"
              />
            ) : null}
          </View>
          {!user?.ageVerified ? (
            <Button label="Get my Verified Age badge" icon="shield-checkmark" variant="soft" size="medium" onPress={() => router.push('/verify-age')} />
          ) : null}
        </Card>

        {mediaError ? (
          <Card style={styles.notice}>
            <View style={styles.noticeRow}>
              <View style={styles.noticeIcon}>
                <Ionicons name="videocam-off" size={24} color={colors.danger} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="heading">TeaTime needs your camera</AppText>
                <AppText variant="body" color={colors.textMuted}>
                  {mediaError === 'denied'
                    ? 'Please allow TeaTime to use your camera and microphone in Settings, then try again.'
                    : 'We could not turn on your camera. Please close other apps that use it and try again.'}
                </AppText>
              </View>
            </View>
            {mediaError === 'denied' && Platform.OS !== 'web' ? (
              <Button
                label="Open Settings"
                variant="secondary"
                size="medium"
                onPress={() => {
                  clearMediaError();
                  void Linking.openSettings();
                }}
              />
            ) : (
              <Button label="OK" variant="secondary" size="medium" onPress={clearMediaError} />
            )}
          </Card>
        ) : null}

        {onlineFriends.length ? (
          <View style={{ gap: space.md }}>
            <AppText variant="heading">Friends here now</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
              {onlineFriends.map((friend) => (
                <Pressable
                  key={friend.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${friend.name}`}
                  onPress={() => callFriend(friend)}
                  style={({ pressed }) => [styles.friendTile, pressed && { opacity: 0.8 }]}
                >
                  <Avatar name={friend.name} photoUrl={friend.photoUrl} size={64} online />
                  <AppText variant="label" numberOfLines={1}>
                    {firstName(friend.name)}
                  </AppText>
                  <View style={styles.callChip}>
                    <Ionicons name="videocam" size={16} color={colors.white} />
                    <AppText variant="caption" color={colors.white}>
                      Call
                    </AppText>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.tips}>
          <Tip icon="happy-outline" text="Smile and say hello. Most people love a chat." />
          <Tip icon="person-add-outline" text="Enjoyed talking? Tap Add friend to call them again later." />
          <Tip icon="shield-checkmark-outline" text="Never share bank details. Tap Report if something feels wrong." />
        </View>
      </ScrollView>
    </View>
  );
}

function Tip({ icon, text }: { icon: ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.tip}>
      <Ionicons name={icon} size={24} color={colors.primary} />
      <AppText variant="body" color={colors.textMuted} style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: space.page,
    paddingBottom: 40,
    gap: space.xl,
  },
  header: {
    paddingTop: space.lg,
  },
  hero: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    paddingBottom: 22,
  },
  illustration: {
    width: '100%',
    aspectRatio: 1200 / 760,
    maxHeight: 190,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.online,
  },
  prefCard: {
    gap: 14,
    paddingVertical: 16,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  prefIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.verifiedSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    gap: 14,
    borderWidth: 2,
    borderColor: colors.dangerSoft,
  },
  noticeRow: {
    flexDirection: 'row',
    gap: 14,
  },
  noticeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendTile: {
    width: 112,
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  callChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.online,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  tips: {
    gap: 14,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
});
