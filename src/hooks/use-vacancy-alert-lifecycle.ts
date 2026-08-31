import NetInfo from '@react-native-community/netinfo';
import { type Href, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { checkVacancyAlerts } from '@/services/vacancy-alerts';
import { getMemoryAccountId } from '@/services/session-memory';

export function useVacancyAlertLifecycle(): void {
  const router = useRouter();
  useEffect(() => {
    const check = () => { if (getMemoryAccountId()) void checkVacancyAlerts(false).catch(() => undefined); };
    const network = NetInfo.addEventListener((state) => { if (state.isConnected) check(); });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    const openResponse = (response: Notifications.NotificationResponse | null) => {
      const href = response?.notification.request.content.data?.href;
      if (href === '/vacancy-searches' || (typeof href === 'string' && /^\/vacancy-match\/[A-Za-z0-9._-]+$/.test(href))) {
        router.push(href as Href);
        if (Platform.OS !== 'web') Notifications.clearLastNotificationResponse();
      }
    };
    const listener = Platform.OS === 'web' ? null : Notifications.addNotificationResponseReceivedListener(openResponse);
    if (Platform.OS !== 'web') openResponse(Notifications.getLastNotificationResponse());
    return () => { network(); appState.remove(); listener?.remove(); };
  }, [router]);
}
