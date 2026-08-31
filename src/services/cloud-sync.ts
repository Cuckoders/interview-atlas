import NetInfo from '@react-native-community/netinfo';

import { ApiAccountError, fetchCloudProgress, pushProgressActions } from '@/services/account-api';
import { getMemoryAccountId } from '@/services/session-memory';
import {
  acknowledgeActions,
  createProgressAction,
  prependProgressActions,
  readOutbox,
} from '@/services/sync-outbox';
import { useAppStore } from '@/store/use-app-store';
import { useSessionStore } from '@/store/use-session-store';
import type { CloudProgress, ProgressAction } from '@/types/account';

let activeSync: Promise<void> | null = null;
let activeInitialization: Promise<void> | null = null;
const initializedUsers = new Set<string>();

export async function initializeCloudProgress(): Promise<void> {
  if (activeInitialization) return activeInitialization;
  activeInitialization = runInitialization();
  try { await activeInitialization; }
  finally { activeInitialization = null; }
}

async function runInitialization(): Promise<void> {
  const userId = getMemoryAccountId();
  if (!userId) return;
  try {
    useSessionStore.getState().setSyncState('syncing');
    const remote = await fetchCloudProgress();
    if (remote.version === 0) {
      await prependProgressActions(userId, seedActions());
    } else {
      applyCloudProgress(remote);
    }
    initializedUsers.add(userId);
    if ((await readOutbox(userId)).length > 0) await synchronizeProgress();
    else useSessionStore.getState().markSynced(new Date().toISOString());
  } catch (error) {
    await recordSyncError(error);
  }
}

export function scheduleProgressSync(): void { void synchronizeProgress(); }

export async function synchronizeProgress(): Promise<void> {
  const userId = getMemoryAccountId();
  if (userId && !initializedUsers.has(userId)) return initializeCloudProgress();
  if (activeSync) return activeSync;
  activeSync = runSync();
  try { await activeSync; }
  finally { activeSync = null; }
}

export function forgetCloudProgress(userId: string | null): void {
  if (userId) initializedUsers.delete(userId);
}

async function runSync(): Promise<void> {
  const userId = getMemoryAccountId();
  if (!userId) return;
  useSessionStore.getState().setSyncState('syncing');
  try {
    let sentAny = false;
    for (let batchNumber = 0; batchNumber < 20; batchNumber += 1) {
      const batch = (await readOutbox(userId)).slice(0, 100);
      if (batch.length === 0) break;
      const result = await pushProgressActions(batch);
      await acknowledgeActions(userId, result.acknowledgedIds);
      applyCloudProgress(result.progress);
      sentAny = true;
    }
    if ((await readOutbox(userId)).length > 0) {
      useSessionStore.getState().setSyncState('syncing');
      setTimeout(scheduleProgressSync, 250);
      return;
    }
    if (!sentAny) applyCloudProgress(await fetchCloudProgress());
    useSessionStore.getState().markSynced(new Date().toISOString());
  } catch (error) {
    await recordSyncError(error);
  }
}

function seedActions(): ProgressAction[] {
  const state = useAppStore.getState();
  return [
    createProgressAction('set_specialty', state.specialty),
    ...state.savedQuestionIds.map((id) => createProgressAction('set_question_saved', true, id)),
    ...state.savedVacancyIds.map((id) => createProgressAction('set_vacancy_saved', true, id)),
    ...state.completedTaskIds.map((id) => createProgressAction('set_task_completed', true, id)),
  ];
}

function applyCloudProgress(progress: CloudProgress): void {
  useAppStore.getState().replaceProgress({
    specialty: progress.specialty,
    savedQuestionIds: progress.savedQuestionIds,
    savedVacancyIds: progress.savedVacancyIds,
    completedTaskIds: progress.completedTaskIds,
  });
}

async function recordSyncError(error: unknown): Promise<void> {
  if (error instanceof ApiAccountError && error.status === 401) {
    initializedUsers.clear();
    useAppStore.getState().resetProgress();
    useSessionStore.getState().setSignedOut();
    return;
  }
  const network = await NetInfo.fetch();
  useSessionStore.getState().setSyncState(
    network.isConnected === false ? 'offline' : 'error',
    error instanceof Error ? error.message : 'Не удалось синхронизировать прогресс',
  );
}
