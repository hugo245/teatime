import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { AppState, Platform } from 'react-native';
import { api } from './api';
import { isSimulator } from './sim';

type Channel = 'calls' | 'messages';
type NotificationData = { type?: string; userId?: string; callId?: string };

const supported = Platform.OS !== 'web' && !isSimulator;
let started = false;
let pendingOpen: NotificationData | null = null;

export function appIsActive() {
  return AppState.currentState === 'active';
}

function openFrom(data: NotificationData) {
  if ((data.type === 'message' || data.type === 'missed-call' || data.type === 'plan') && data.userId) {
    router.push({ pathname: '/chat/[id]', params: { id: data.userId } });
  } else if (data.type === 'event') {
    router.navigate('/events');
  } else if (data.type === 'daily') {
    router.navigate('/');
  }
}

export function openPendingNotification() {
  if (!pendingOpen) return;
  const data = pendingOpen;
  pendingOpen = null;
  setTimeout(() => openFrom(data), 300);
}

export async function startNotifications(signedIn: boolean) {
  if (!supported || started || !signedIn) return;
  started = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: !appIsActive(),
      shouldShowList: !appIsActive(),
      shouldPlaySound: !appIsActive(),
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Calls',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'ring.wav',
      vibrationPattern: [0, 800, 400, 800, 400, 800],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    }).catch(() => null);
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 300, 200, 300],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => null);
  }

  Notifications.addNotificationResponseReceivedListener((response) => {
    openFrom(response.notification.request.content.data as NotificationData);
  });
  const last = await Notifications.getLastNotificationResponseAsync().catch(() => null);
  if (last) pendingOpen = last.notification.request.content.data as NotificationData;

  let permission = await Notifications.getPermissionsAsync().catch(() => null);
  if (permission && !permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync().catch(() => null);
  }
  if (!permission?.granted) return;

  if (Platform.OS === 'android') {
    try {
      const token = await Notifications.getDevicePushTokenAsync();
      if (typeof token.data === 'string' && token.data) await api.savePushToken('android', token.data);
    } catch {
      return;
    }
  }
}

export function notifyLocal(channel: Channel, title: string, body: string, data: NotificationData) {
  if (!supported || appIsActive()) return;
  void Notifications.scheduleNotificationAsync({
    identifier: data.callId ? `call-${data.callId}` : data.userId ? `chat-${data.userId}` : undefined,
    content: { title, body, data, sound: channel === 'calls' ? 'ring.wav' : 'default' },
    trigger: Platform.OS === 'android' ? { channelId: channel } : null,
  }).catch(() => null);
}

export function clearCallNotification(callId: string) {
  if (!supported) return;
  void Notifications.dismissNotificationAsync(`call-${callId}`).catch(() => null);
}
