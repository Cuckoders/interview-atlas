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

const deviceName = `Interview Atlas ${Platform.OS}`;

export async function bootstrapSession(): Promise<void> {
  await waitForProgressHydration();
  useSessionStore.getState().setRestoring();
  const user = await restoreAccountSession();
  if (!user) {
    useSessionStore.getState().setSignedOut();
    return;
  }
  useSessionStore.getState().setSignedIn(user);
  await initializeCloudProgress();
}

export async function signIn(email: string, password: string): Promise<void> {
  await waitForProgressHydration();
  useSessionStore.getState().setRestoring();
  try {
    const user = await loginRemoteAccount({ email, password, deviceName });
    useSessionStore.getState().setSignedIn(user);
    await initializeCloudProgress();
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
    useSessionStore.getState().setSignedIn(user);
    await initializeCloudProgress();
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
  useAppStore.getState().resetProgress();
  useSessionStore.getState().setSignedOut();
}

export async function removeAccount(password: string): Promise<void> {
  const userId = getMemoryAccountId();
  await deleteRemoteAccount(password);
  forgetCloudProgress(userId);
  if (userId) await clearOutbox(userId);
  useAppStore.getState().resetProgress();
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
