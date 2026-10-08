import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api, type ChatMessage, type TeaEvent } from './api';
import { firstName } from './format';
import { isSimulator } from './sim';

const supported = Platform.OS !== 'web' && !isSimulator;
const HOUR = 60 * 60 * 1000;

function at(date: number, channel: 'messages' | 'calls' = 'messages'): Notifications.NotificationTriggerInput {
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(date), ...(Platform.OS === 'android' ? { channelId: channel } : {}) };
}

async function schedule(identifier: string, when: number, title: string, body: string, data: Record<string, string>, channel: 'messages' | 'calls' = 'messages') {
  if (!supported || when <= Date.now() + 30_000) return;
  await Notifications.scheduleNotificationAsync({ identifier, content: { title, body, data, sound: 'default' }, trigger: at(when, channel) }).catch(() => null);
}

async function cancel(identifier: string) {
  if (!supported) return;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => null);
}

async function scheduledIds(prefix: string) {
  if (!supported) return [];
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  return all.map((n) => n.identifier).filter((id) => id.startsWith(prefix));
}

export function timeText(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return `today at ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  return `${date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} at ${time}`;
}

export async function schedulePlanReminder(message: ChatMessage, otherId: string, otherName: string) {
  if (!message.plan || message.plan.cancelled) {
    await cancelPlanReminder(message.id);
    return;
  }
  const name = firstName(otherName);
  await schedule(`plan-${message.id}`, message.plan.at, `Time to call ${name}`, `You planned a video call with ${name} now. Tap to open TeaTime.`, {
    type: 'plan',
    userId: otherId,
  }, 'calls');
  await schedule(`plan-${message.id}-soon`, message.plan.at - 15 * 60 * 1000, `Call with ${name} in 15 minutes`, 'Make yourself a cup of tea.', {
    type: 'plan',
    userId: otherId,
  });
}

export async function cancelPlanReminder(messageId: number) {
  await cancel(`plan-${messageId}`);
  await cancel(`plan-${messageId}-soon`);
}

export async function syncPlanReminders(myId: string | undefined) {
  if (!supported || !myId) return;
  const plans = await api.plans().catch(() => null);
  if (!plans) return;
  const keep = new Set(plans.flatMap((p) => [`plan-${p.message.id}`, `plan-${p.message.id}-soon`]));
  for (const id of await scheduledIds('plan-')) if (!keep.has(id)) await cancel(id);
  for (const plan of plans) await schedulePlanReminder(plan.message, plan.user.id, plan.user.name);
}

export async function scheduleEventReminders(event: TeaEvent) {
  if (!event.attending) {
    await cancelEventReminders(event.id);
    return;
  }
  const place = event.location ? ` at ${event.location}` : '';
  await schedule(`event-${event.id}-day`, event.startsAt - 24 * HOUR, `${event.title} is tomorrow`, `See you ${timeText(event.startsAt)}${place}.`, { type: 'event' });
  await schedule(`event-${event.id}-hour`, event.startsAt - HOUR, `${event.title} starts in one hour`, `See you soon${place}.`, { type: 'event' });
}

export async function cancelEventReminders(eventId: string) {
  await cancel(`event-${eventId}-day`);
  await cancel(`event-${eventId}-hour`);
}

export async function syncEventReminders(events: TeaEvent[]) {
  if (!supported) return;
  const keep = new Set(events.filter((e) => e.attending).flatMap((e) => [`event-${e.id}-day`, `event-${e.id}-hour`]));
  for (const id of await scheduledIds('event-')) if (!keep.has(id)) await cancel(id);
  for (const event of events) if (event.attending) await scheduleEventReminders(event);
}

export async function setDailyReminder(enabled: boolean, hour: number) {
  if (!supported) return;
  await cancel('daily-tea');
  if (!enabled) return;
  await Notifications.scheduleNotificationAsync({
    identifier: 'daily-tea',
    content: { title: 'It is tea time', body: 'Open TeaTime and have a friendly chat with someone.', data: { type: 'daily' }, sound: 'default' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
      ...(Platform.OS === 'android' ? { channelId: 'messages' } : {}),
    },
  }).catch(() => null);
}

export async function refreshAllReminders(myId: string | undefined) {
  if (!supported || !myId) return;
  await syncPlanReminders(myId);
  const events = await api.events().catch(() => null);
  if (events) await syncEventReminders(events);
}
