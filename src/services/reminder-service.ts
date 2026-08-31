import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PreparationSnapshot } from '@/types/preparation';

const IDS_KEY = 'interview-atlas-reminder-ids-v1';
const CHANNEL_ID = 'preparation-plan';

Notifications.setNotificationHandler({ handleNotification: async () => ({
  shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
}) });

export async function enableAndScheduleReminders(snapshot: PreparationSnapshot): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'План подготовки', importance: Notifications.AndroidImportance.DEFAULT,
      description: 'Напоминания о запланированных учебных сессиях', vibrationPattern: [0, 180],
    });
  }
  let permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) permissions = await Notifications.requestPermissionsAsync();
  if (!permissions.granted) return false;
  await rescheduleReminders(snapshot);
  return true;
}

export async function rescheduleReminders(snapshot: PreparationSnapshot): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelPreparationReminders();
  const { profile, plan } = snapshot;
  if (!profile?.remindersEnabled || !plan) return;
  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) return;
  const identifiers: string[] = [];
  for (const session of plan.sessions.filter((item) => item.status === 'pending')) {
    const date = reminderDate(session.date, profile.reminderHour, profile.reminderMinute, profile.quietStartMinute, profile.quietEndMinute);
    if (date.getTime() <= Date.now() + 60_000) continue;
    identifiers.push(await Notifications.scheduleNotificationAsync({
      content: {
        title: `Пора готовиться: ${session.skillLabel}`,
        body: `${session.durationMinutes} минут · ${session.title}`,
        data: { href: `/preparation?session=${encodeURIComponent(session.id)}` },
      },
      trigger: Platform.OS === 'android'
        ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID }
        : { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    }));
  }
  await AsyncStorage.setItem(IDS_KEY, JSON.stringify(identifiers));
}

export async function cancelPreparationReminders(): Promise<void> {
  if (Platform.OS === 'web') { await AsyncStorage.removeItem(IDS_KEY); return; }
  const raw = await AsyncStorage.getItem(IDS_KEY);
  const identifiers = raw ? safeIds(raw) : [];
  await Promise.all(identifiers.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  await AsyncStorage.removeItem(IDS_KEY);
}

function reminderDate(dateValue: string, hour: number, minute: number, quietStart: number, quietEnd: number): Date {
  const [year, month, day] = dateValue.split('-').map(Number);
  const result = new Date(year ?? 2000, (month ?? 1) - 1, day ?? 1, hour, minute, 0, 0);
  const selected = hour * 60 + minute;
  const overnight = quietStart > quietEnd;
  const quiet = overnight ? selected >= quietStart || selected < quietEnd : selected >= quietStart && selected < quietEnd;
  if (!quiet) return result;
  if (overnight && selected >= quietStart) result.setDate(result.getDate() + 1);
  result.setHours(Math.floor(quietEnd / 60), quietEnd % 60, 0, 0);
  return result;
}
function safeIds(raw: string): string[] {
  try { const value = JSON.parse(raw); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
  catch { return []; }
}
