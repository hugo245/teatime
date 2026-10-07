import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { InterestChip } from '../components/Chip';
import { StatusBarStyle } from '../components/StatusBarStyle';
import { clock, firstName, talkDuration } from '../lib/format';
import { interestLabels, joinWords } from '../lib/interests';
import { VideoView } from '../rtc';
import { colors, radius, shadow, space } from '../theme';
import {
  addPeerAsFriend,
  answerIncoming,
  callFriend,
  cancelOutgoing,
  cancelSearch,
  declineIncoming,
  dismissEnded,
  hangUp,
  reportPeer,
  startMeeting,
  toggleCamera,
  toggleMic,
  useCall,
  type EndReason,
} from './engine';
import { Pulse } from './Pulse';
import { ReportSheet } from './ReportSheet';
import { RoundButton } from './RoundButton';

export function CallOverlay() {
  const phase = useCall((s) => s.phase);
  if (phase === 'idle') return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      {keepAwakeSupported ? <KeepAwake /> : null}
      {phase === 'preparing' || phase === 'searching' ? <SearchingView /> : null}
      {phase === 'outgoing' ? <OutgoingView /> : null}
      {phase === 'incoming' ? <IncomingView /> : null}
      {phase === 'connecting' || phase === 'live' ? <InCallView /> : null}
      {phase === 'ended' ? <EndedView /> : null}
    </View>
  );
}

function KeepAwake() {
  useKeepAwake();
  return null;
}

const keepAwakeSupported = Platform.OS !== 'web';

function SelfBackground() {
  const local = useCall((s) => s.localStream);
  return (
    <View style={StyleSheet.absoluteFill}>
      {local ? <VideoView stream={local} mirror muted style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(17,24,20,0.45)' }]} />
    </View>
  );
}

function SearchingView() {
  const phase = useCall((s) => s.phase);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.dark, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <StatusBarStyle style="light" />
      <SelfBackground />
      <View style={styles.center}>
        <Pulse size={128} color="rgba(255,255,255,0.5)">
          <View style={styles.searchIcon}>
            <Ionicons name="cafe" size={56} color={colors.primary} />
          </View>
        </Pulse>
        <AppText variant="title" color={colors.white} center style={{ marginTop: 40 }} accessibilityLiveRegion="polite">
          {phase === 'preparing' ? 'Turning on your camera' : 'Finding someone to talk with'}
        </AppText>
        <AppText variant="body" color="rgba(255,255,255,0.85)" center style={{ marginTop: 8, maxWidth: 320 }}>
          {phase === 'preparing' ? 'Just a moment.' : 'This usually takes less than a minute. You are on camera once someone joins.'}
        </AppText>
      </View>
      <View style={styles.bottomActions}>
        <Button label="Stop looking" variant="light" icon="close" onPress={cancelSearch} />
      </View>
    </View>
  );
}

function OutgoingView() {
  const peer = useCall((s) => s.peer);
  const insets = useSafeAreaInsets();
  if (!peer) return null;
  return (
    <View style={[styles.dark, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <StatusBarStyle style="light" />
      <SelfBackground />
      <View style={styles.center}>
        <Pulse size={160} color="rgba(255,255,255,0.45)">
          <Avatar name={peer.name} photoUrl={peer.photoUrl} size={160} ring />
        </Pulse>
        <AppText variant="display" color={colors.white} center style={{ marginTop: 36 }}>
          Calling {firstName(peer.name)}
        </AppText>
        <AppText variant="body" color="rgba(255,255,255,0.85)" center style={{ marginTop: 6 }} accessibilityLiveRegion="polite">
          Waiting for {firstName(peer.name)} to answer
        </AppText>
      </View>
      <View style={styles.controlsRow}>
        <RoundButton icon="close" label="Cancel" color={colors.danger} size={76} onPress={cancelOutgoing} />
      </View>
    </View>
  );
}

function IncomingView() {
  const peer = useCall((s) => s.peer);
  const insets = useSafeAreaInsets();
  if (!peer) return null;
  return (
    <View style={[styles.dark, { backgroundColor: colors.primaryPressed, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <StatusBarStyle style="light" />
      <View style={styles.center}>
        <Pulse size={170} color="rgba(255,255,255,0.4)">
          <Avatar name={peer.name} photoUrl={peer.photoUrl} size={170} ring />
        </Pulse>
        <AppText variant="display" color={colors.white} center style={{ marginTop: 40 }} accessibilityLiveRegion="assertive">
          {peer.name} is calling
        </AppText>
        <AppText variant="body" color="rgba(255,255,255,0.85)" center style={{ marginTop: 6 }}>
          {peer.location ? `Video call from ${peer.location}` : 'Video call'}
        </AppText>
      </View>
      <View style={[styles.controlsRow, { justifyContent: 'space-evenly' }]}>
        <RoundButton icon="close" label="Not now" color={colors.danger} size={80} onPress={declineIncoming} />
        <RoundButton icon="videocam" label="Answer" color={colors.online} size={80} onPress={answerIncoming} />
      </View>
    </View>
  );
}

function LiveTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <View style={styles.timer}>
      <View style={styles.liveDot} />
      <AppText variant="label" color={colors.white} scale={false}>
        {clock(now - startedAt)}
      </AppText>
    </View>
  );
}

function InCallView() {
  const insets = useSafeAreaInsets();
  const { phase, peer, remoteStream, localStream, micOn, cameraOn, friendship, sharedInterests, startedAt, peerReconnecting } = useCall();
  const [reporting, setReporting] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(insets.top + 120);
  if (!peer) return null;
  const live = phase === 'live';
  const shared = interestLabels(sharedInterests);

  const friendButton =
    friendship === 'friends'
      ? { icon: 'heart' as const, label: 'Friends', disabled: true, color: 'rgba(255,255,255,0.18)' }
      : friendship === 'requested'
        ? { icon: 'checkmark' as const, label: 'Request sent', disabled: true, color: 'rgba(255,255,255,0.18)' }
        : friendship === 'incoming'
          ? { icon: 'person-add' as const, label: 'Accept friend', disabled: false, color: colors.accent }
          : { icon: 'person-add' as const, label: 'Add friend', disabled: false, color: colors.primary };

  return (
    <View style={[styles.dark, { backgroundColor: colors.callBg }]}>
      <StatusBarStyle style="light" />
      {live && remoteStream ? (
        <VideoView stream={remoteStream} style={StyleSheet.absoluteFill} zOrder={0} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Pulse size={150} color="rgba(255,255,255,0.3)">
            <Avatar name={peer.name} photoUrl={peer.photoUrl} size={150} ring />
          </Pulse>
          <AppText variant="title" color={colors.white} center style={{ marginTop: 32 }} accessibilityLiveRegion="polite">
            Connecting to {firstName(peer.name)}
          </AppText>
        </View>
      )}

      <View style={[styles.topShade, { paddingTop: insets.top + 8 }]} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <View style={styles.topRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title" color={colors.white} numberOfLines={1}>
              {peer.name}
            </AppText>
            {peer.location ? (
              <AppText variant="body" color="rgba(255,255,255,0.9)" numberOfLines={1}>
                {peer.location}
              </AppText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Report ${peer.name}`}
            onPress={() => setReporting(true)}
            hitSlop={10}
            style={({ pressed }) => [styles.reportButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="flag-outline" size={20} color={colors.white} />
            <AppText variant="label" color={colors.white}>
              Report
            </AppText>
          </Pressable>
        </View>
        <View style={styles.metaRow}>
          {live && startedAt ? <LiveTimer startedAt={startedAt} /> : null}
          {shared.length ? (
            <View style={styles.sharedPill}>
              <Ionicons name="sparkles" size={16} color={colors.white} />
              <AppText variant="caption" color={colors.white} numberOfLines={2} style={{ flexShrink: 1 }}>
                You both enjoy {joinWords(shared)}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>

      {localStream ? (
        <View style={[styles.pip, { top: headerHeight + 12 }]}>
          {cameraOn ? (
            <VideoView stream={localStream} mirror muted style={StyleSheet.absoluteFill} zOrder={1} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: '#26302B' }]}>
              <Ionicons name="videocam-off" size={28} color={colors.white} />
            </View>
          )}
        </View>
      ) : null}

      {peerReconnecting ? (
        <View style={[styles.reconnecting, { top: headerHeight + 12 }]}>
          <AppText variant="label" color={colors.text}>
            Weak connection, please wait
          </AppText>
        </View>
      ) : null}

      <View style={[styles.bottomShade, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        {friendship === 'incoming' ? (
          <View style={styles.friendBanner}>
            <Avatar name={peer.name} photoUrl={peer.photoUrl} size={44} />
            <AppText variant="bodyStrong" style={{ flex: 1 }}>
              {firstName(peer.name)} would like to be your friend
            </AppText>
          </View>
        ) : null}
        <View style={styles.controlsRow}>
          <RoundButton icon={micOn ? 'mic' : 'mic-off'} label={micOn ? 'Mute' : 'Unmute'} onPress={toggleMic} color={micOn ? 'rgba(255,255,255,0.18)' : colors.white} iconColor={micOn ? colors.white : colors.text} />
          <RoundButton icon={cameraOn ? 'videocam' : 'videocam-off'} label={cameraOn ? 'Camera' : 'Camera off'} onPress={toggleCamera} color={cameraOn ? 'rgba(255,255,255,0.18)' : colors.white} iconColor={cameraOn ? colors.white : colors.text} />
          <RoundButton icon={friendButton.icon} label={friendButton.label} onPress={addPeerAsFriend} disabled={friendButton.disabled} color={friendButton.color} />
          <RoundButton icon="call" label="End call" onPress={hangUp} color={colors.danger} />
        </View>
      </View>

      <ReportSheet name={firstName(peer.name)} visible={reporting} onClose={() => setReporting(false)} onReport={reportPeer} />
    </View>
  );
}

function endedCopy(reason: EndReason | null, name: string, talked: number | null): { title: string; message: string; icon: 'call' | 'cloud-offline' | 'time' | 'heart' | 'shield-checkmark' } {
  switch (reason) {
    case 'declined':
      return { title: `${name} can't talk right now`, message: 'Why not try again a little later?', icon: 'time' };
    case 'no-answer':
      return { title: `${name} did not answer`, message: 'They may be away from their phone. You can try again later.', icon: 'time' };
    case 'offline':
      return { title: `${name} is not on TeaTime right now`, message: 'You can call when you see the green dot next to their name.', icon: 'time' };
    case 'busy':
      return { title: `${name} is in another call`, message: 'Please try again in a little while.', icon: 'time' };
    case 'unavailable':
    case 'not-friends':
      return { title: `${name} is not available`, message: 'Please try again later.', icon: 'time' };
    case 'no-internet':
      return { title: 'No internet connection', message: 'Please check your Wi-Fi or mobile data and try again.', icon: 'cloud-offline' };
    case 'connection':
    case 'disconnected':
      return { title: 'The call was disconnected', message: 'This can happen when the internet is slow. You can try again.', icon: 'cloud-offline' };
    case 'reported':
      return { title: 'Thank you for telling us', message: `You will not be matched with ${name} again. Our team will look at what happened.`, icon: 'shield-checkmark' };
    default:
      if (talked === null) return { title: `${name} had to leave`, message: 'They left before the call started. Let us find someone else for you.', icon: 'call' };
      return { title: `Your chat with ${name} has ended`, message: `You talked for ${talkDuration(talked)}.`, icon: 'heart' };
  }
}

function EndedView() {
  const insets = useSafeAreaInsets();
  const { peer, kind, endReason, startedAt, endedAt, friendship } = useCall();
  const [reporting, setReporting] = useState(false);
  const name = peer ? firstName(peer.name) : 'They';
  const talked = startedAt && endedAt ? endedAt - startedAt : null;
  const copy = endedCopy(endReason, name, talked);
  const failedFriendCall = kind === 'friend' && ['declined', 'no-answer', 'offline', 'busy', 'unavailable', 'connection', 'disconnected', 'no-internet'].includes(endReason ?? '');
  const showFriendAction = !!peer && endReason !== 'reported' && kind === 'random' && talked !== null;

  return (
    <View style={[styles.light, { paddingTop: insets.top }]}>
      <StatusBarStyle style="dark" />
      <ScrollView contentContainerStyle={styles.endedContent}>
        {peer ? (
          <View style={{ alignSelf: 'center', width: 132, height: 132 }}>
            <Avatar name={peer.name} photoUrl={peer.photoUrl} size={132} />
            <View style={styles.endedBadge}>
              <Ionicons name={copy.icon} size={22} color={colors.primary} />
            </View>
          </View>
        ) : null}
        <AppText variant="title" center accessibilityRole="header" style={{ marginTop: 20 }}>
          {copy.title}
        </AppText>
        <AppText variant="body" color={colors.textMuted} center style={{ marginTop: 8 }}>
          {copy.message}
        </AppText>

        {showFriendAction && peer ? (
          <View style={styles.friendCard}>
            {friendship === 'friends' ? (
              <View style={styles.friendCardRow}>
                <Ionicons name="heart" size={26} color={colors.danger} />
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  You and {name} are friends. You can call {name} from the Friends tab.
                </AppText>
              </View>
            ) : friendship === 'requested' ? (
              <View style={styles.friendCardRow}>
                <Ionicons name="paper-plane" size={24} color={colors.primary} />
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  Friend request sent. When {name} accepts, you can call each other any time.
                </AppText>
              </View>
            ) : (
              <>
                <AppText variant="bodyStrong" center>
                  {friendship === 'incoming' ? `${name} would like to be your friend` : `Did you enjoy talking with ${name}?`}
                </AppText>
                <Button
                  label={friendship === 'incoming' ? 'Accept friend request' : `Add ${name} as a friend`}
                  icon="person-add"
                  variant="soft"
                  onPress={addPeerAsFriend}
                />
              </>
            )}
            {peer.interests.length ? (
              <View style={styles.chips}>
                {peer.interests.slice(0, 4).map((id) => (
                  <InterestChip key={id} id={id} small />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.endedFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {kind === 'random' ? <Button label="Meet someone new" icon="cafe" onPress={startMeeting} /> : null}
        {failedFriendCall && peer && endReason !== 'no-internet' && endReason !== 'offline' ? (
          <Button label={`Call ${name} again`} icon="videocam" onPress={() => callFriend(peer)} />
        ) : null}
        <Button label="Done" variant="secondary" onPress={dismissEnded} />
        {peer && endReason !== 'reported' && talked !== null ? (
          <Button label={`Report ${name}`} variant="dangerGhost" size="small" onPress={() => setReporting(true)} />
        ) : null}
      </View>

      {peer ? <ReportSheet name={name} visible={reporting} onClose={() => setReporting(false)} onReport={reportPeer} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dark: {
    flex: 1,
    backgroundColor: colors.callBg,
  },
  light: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  searchIcon: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
  bottomActions: {
    paddingHorizontal: space.page,
    paddingBottom: 8,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  topShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.page,
    paddingBottom: 18,
    backgroundColor: 'rgba(17,24,20,0.42)',
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.online,
  },
  sharedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    flexShrink: 1,
  },
  pip: {
    position: 'absolute',
    right: space.page,
    width: 108,
    height: 148,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: '#26302B',
  },
  reconnecting: {
    position: 'absolute',
    left: space.page,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 18,
    backgroundColor: 'rgba(17,24,20,0.42)',
    gap: 14,
  },
  friendBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: space.page,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  endedContent: {
    paddingHorizontal: space.page,
    paddingTop: 48,
    paddingBottom: 24,
    alignItems: 'stretch',
  },
  endedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  friendCard: {
    marginTop: 28,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 20,
    gap: 14,
    ...shadow.card,
  },
  friendCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  endedFooter: {
    paddingHorizontal: space.page,
    paddingTop: 8,
    gap: 12,
  },
});
