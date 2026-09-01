import { Platform } from 'react-native';

import {
  deleteAccount as deleteRemoteAccount,
  exportAccountData,
  loginAccount as loginRemoteAccount,
  logoutAccount as logoutRemoteAccount,
  registerAccount as registerRemoteAccount,
  restoreAccountSession,
} from '@/services/account-api';
import { forgetCloudProgress, initializeCloudProgress, synchronizeProgress } from '@/services/cloud-sync';
import { getMemoryAccountId } from '@/services/session-memory';
import { clearOutbox } from '@/services/sync-outbox';
import { useAppStore } from '@/store/use-app-store';
import { useSessionStore } from '@/store/use-session-store';
import { initializePreparation } from '@/services/preparation-sync';
import { clearPreparationOutbox } from '@/services/preparation-outbox';
import { usePreparationStore } from '@/store/use-preparation-store';
import { cancelPreparationReminders } from '@/services/reminder-service';
import {
  forgetLearningCacheOwner, hydrateLearningCacheOwner, purgeLearningCache, rememberLearningCacheOwner,
} from '@/services/learning-lab-cache';

const deviceName = `Interview Atlas ${Platform.OS}`;

export async function bootstrapSession(): Promise<void> {
  await waitForProgressHydration();
  await hydrateLearningCacheOwner();
  useSessionStore.getState().setRestoring();
  const user = await restoreAccountSession();
  if (!user) {
    useSessionStore.getState().setSignedOut();
    return;
  }
  await rememberLearningCacheOwner(user.id);
  useSessionStore.getState().setSignedIn(user);
  await initializeCloudProgress();
  await initializePreparation();
}

export async function signIn(email: string, password: string): Promise<void> {
  await waitForProgressHydration();
  useSessionStore.getState().setRestoring();
  try {
    const user = await loginRemoteAccount({ email, password, deviceName });
    await rememberLearningCacheOwner(user.id);
    useSessionStore.getState().setSignedIn(user);
    await initializeCloudProgress();
    await initializePreparation();
  } catch (error) {
    useSessionStore.getState().setSignedOut();
    throw error;
  }
}

export async function signUp(displayName: string, email: string, password: string): Promise<void> {
  await waitForProgressHydration();
  useSessionStore.getState().setRestoring();
  try {
    const user = await registerRemoteAccount({ displayName, email, password, deviceName });
    await rememberLearningCacheOwner(user.id);
    useSessionStore.getState().setSignedIn(user);
    await initializeCloudProgress();
    await initializePreparation();
  } catch (error) {
    useSessionStore.getState().setSignedOut();
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const userId = getMemoryAccountId();
  await synchronizeProgress();
  forgetCloudProgress(userId);
  await logoutRemoteAccount();
  await forgetLearningCacheOwner();
  useAppStore.getState().resetProgress();
  await cancelPreparationReminders().catch(() => undefined);
  usePreparationStore.getState().reset();
  useSessionStore.getState().setSignedOut();
}

export async function removeAccount(password: string): Promise<void> {
  const userId = getMemoryAccountId();
  await deleteRemoteAccount(password);
  forgetCloudProgress(userId);
  if (userId) await clearOutbox(userId);
  if (userId) await clearPreparationOutbox(userId);
  if (userId) await purgeLearningCache(userId);
  await forgetLearningCacheOwner();
  useAppStore.getState().resetProgress();
  await cancelPreparationReminders().catch(() => undefined);
  usePreparationStore.getState().reset();
  useSessionStore.getState().setSignedOut();
}

export { exportAccountData };

async function waitForProgressHydration(): Promise<void> {
  if (useAppStore.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    let unsubscribe = () => {};
    const finish = () => {
      unsubscribe();
      resolve();
    };
    unsubscribe = useAppStore.persist.onFinishHydration(finish);
    if (useAppStore.persist.hasHydrated()) finish();
  });
}
