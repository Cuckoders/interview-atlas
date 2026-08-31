import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { checkSavedSearches } from '@/services/vacancy-intelligence-api';
import type { VacancyAlertCheck } from '@/types/vacancy-intelligence';

const CHANNEL_ID = 'vacancy-alerts';

export async function requestVacancyAlertPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await ensureChannel();
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  return permission.granted;
}

export async function checkVacancyAlerts(force = false): Promise<VacancyAlertCheck | null> {
  if (Platform.OS === 'web') return null;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return null;
  await ensureChannel();
  const result = await checkSavedSearches(force);
  if (result.totalNew === 0) return result;
  const names = result.searches.filter((item) => item.newCount > 0).map((item) => item.search.name).slice(0, 2);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: result.totalNew === 1 ? 'Новая подходящая вакансия' : `Новых вакансий: ${result.totalNew}`,
      body: names.length ? `Поиски: ${names.join(', ')}${result.searches.length > 2 ? ' и другие' : ''}` : 'Откройте сохранённые поиски, чтобы посмотреть.',
      data: { href: '/vacancy-searches' },
    },
    trigger:
      Platform.OS === 'android'
        ? {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 1,
            repeats: false,
            channelId: CHANNEL_ID,
          }
        : null,
  });
  return result;
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Новые вакансии',
    description: 'Одно сгруппированное уведомление о новых результатах сохранённых поисков',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 160],
  });
}
