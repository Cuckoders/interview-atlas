import NetInfo from '@react-native-community/netinfo';
import { type Href, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { initializePreparation, synchronizePreparation } from '@/services/preparation-sync';
import { setPreparationSyncWakeup } from '@/services/preparation-outbox';

export function usePreparationLifecycle(): void {
  const router = useRouter();
  useEffect(() => {
    void initializePreparation();
    setPreparationSyncWakeup(() => { void synchronizePreparation(); });
    const network = NetInfo.addEventListener((state) => { if (state.isConnected) void synchronizePreparation(); });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') void synchronizePreparation();
    });
    const openResponse = (response: Notifications.NotificationResponse | null) => {
      const href = response?.notification.request.content.data?.href;
      if (typeof href === 'string' && href.startsWith('/preparation')) {
        router.push(href as Href);
        if (Platform.OS !== 'web') Notifications.clearLastNotificationResponse();
      }
    };
    const responseListener = Platform.OS === 'web' ? null : Notifications.addNotificationResponseReceivedListener(openResponse);
    if (Platform.OS !== 'web') openResponse(Notifications.getLastNotificationResponse());
    return () => {
      setPreparationSyncWakeup(null); network(); appState.remove(); responseListener?.remove();
    };
  }, [router]);
}
