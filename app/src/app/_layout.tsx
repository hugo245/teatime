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
import { StatusBarStyle } from '../components/StatusBarStyle';
import { isSimulator, postToSimulator } from '../lib/sim';
import { useFriends } from '../state/friends';
import { useSession } from '../state/session';
import { useSettings } from '../state/settings';
import { colors } from '../theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

const SIM_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

function SimulatorInsets({ children }: { children: ReactNode }) {
  if (!isSimulator) return <>{children}</>;
  return <SafeAreaInsetsContext.Provider value={SIM_INSETS}>{children}</SafeAreaInsetsContext.Provider>;
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
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'signedIn' || !justJoined) return;
    const timer = setTimeout(() => router.push({ pathname: '/verify-age', params: { first: '1' } }), 350);
    return () => clearTimeout(timer);
  }, [status, justJoined]);

  const ready = (fontsLoaded || !!fontError) && settingsLoaded && status !== 'loading';

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
