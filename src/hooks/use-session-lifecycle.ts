import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { scheduleProgressSync, synchronizeProgress } from '@/services/cloud-sync';
import { bootstrapSession } from '@/services/session-actions';
import { setSyncWakeup } from '@/services/sync-outbox';

export function useSessionLifecycle(): void {
  useEffect(() => {
    void bootstrapSession();
    setSyncWakeup(scheduleProgressSync);
    const networkSubscription = NetInfo.addEventListener((state) => {
      if (state.isConnected) void synchronizeProgress();
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') void synchronizeProgress();
    });
    return () => {
      setSyncWakeup(null);
      networkSubscription();
      appStateSubscription.remove();
    };
  }, []);
}
