import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { CallOverlay } from '../call/CallOverlay';
import { refreshIceServers, resetCall } from '../call/engine';
import { ConnectionBanner, DialogHost, ToastHost } from '../components/Overlays';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { StatusBarStyle } from '../components/StatusBarStyle';
import { isSimulator, postToSimulator } from '../lib/sim';
import { openPendingNotification, startNotifications } from '../lib/notifications';
import { refreshAllReminders, setDailyReminder } from '../lib/reminders';
import { useChats } from '../state/chats';
import { resetNotices } from '../state/notices';
import { useFriends } from '../state/friends';
import { useSession } from '../state/session';
import { useSettings } from '../state/settings';
import { watchForUpdates } from '../state/updates';
import { colors } from '../theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

const SIM_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

function SimulatorInsets({ children }: { children: ReactNode }) {
  if (!isSimulator) return <>{children}</>;
  return <SafeAreaInsetsContext.Provider value={SIM_INSETS}>{children}</SafeAreaInsetsContext.Provider>;
}

export function ErrorBoundary({ retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
      <Ionicons name="cafe" size={56} color={colors.primary} />
      <AppText variant="title" center>
        Something went wrong
      </AppText>
      <AppText variant="body" color={colors.textMuted} center>
        Sorry about that. Please tap the button to try again.
      </AppText>
      <Button label="Try again" icon="refresh" onPress={() => void retry()} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    ...Ionicons.font,
  });
  const status = useSession((s) => s.status);
  const justJoined = useSession((s) => s.justJoined);
  const settingsLoaded = useSettings((s) => s.loaded);

  useEffect(() => {
    (async () => {
      await useSettings.getState().load();
      await useSession.getState().load();
      void refreshIceServers();
    })();
  }, []);

  useEffect(() => {
    if (status === 'signedOut') {
      resetCall();
      useFriends.getState().reset();
      useChats.getState().reset();
      resetNotices();
      void setDailyReminder(false, 15);
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'signedIn' || !justJoined) return;
    const timer = setTimeout(() => router.push({ pathname: '/verify-age', params: { first: '1' } }), 350);
    return () => clearTimeout(timer);
  }, [status, justJoined]);

  const ready = (fontsLoaded || !!fontError) && settingsLoaded && status !== 'loading';

  useEffect(() => {
    if (!ready) return;
    return watchForUpdates();
  }, [ready]);

  useEffect(() => {
    if (!ready || status !== 'signedIn' || justJoined) return;
    void startNotifications(true).then(() => {
      openPendingNotification();
      const { dailyReminder, dailyHour } = useSettings.getState();
      void setDailyReminder(dailyReminder, dailyHour);
      void refreshAllReminders(useSession.getState().user?.id);
    });
  }, [ready, status, justJoined]);

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync().catch(() => {});
      postToSimulator({ type: 'teatime:ready' });
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <SimulatorInsets>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBarStyle style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Protected guard={status === 'signedIn'}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="edit-profile" />
            <Stack.Screen name="friend/[id]" />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="blocked" />
            <Stack.Screen name="verify-age" />
          </Stack.Protected>
          <Stack.Protected guard={status === 'signedOut'}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
          <Stack.Screen name="help" />
        </Stack>
        <ConnectionBanner />
        <CallOverlay />
        <ToastHost />
        <DialogHost />
      </View>
    </SimulatorInsets>
  );
}
