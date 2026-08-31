import NetInfo from '@react-native-community/netinfo';

import { ApiAccountError } from '@/services/account-api';
import {
  fetchPreparation,
  regeneratePreparationPlan,
  submitDiagnostic,
  submitSessionCompletion,
  updatePreparationProfile,
} from '@/services/preparation-api';
import {
  acknowledgePreparationAction,
  createCompletionId,
  enqueuePreparationCompletion,
  readPreparationOutbox,
} from '@/services/preparation-outbox';
import { cancelPreparationReminders, rescheduleReminders } from '@/services/reminder-service';
import { getMemoryAccountId } from '@/services/session-memory';
import { usePreparationStore } from '@/store/use-preparation-store';
import { useSessionStore } from '@/store/use-session-store';
import type { CompletionQuality, PreparationProfileInput, PreparationSnapshot } from '@/types/preparation';

let activeSync: Promise<void> | null = null;

export async function initializePreparation(): Promise<void> {
  const userId = getMemoryAccountId();
  if (!userId) { usePreparationStore.getState().reset(); return; }
  const cached = usePreparationStore.getState();
  if (cached.ownerId !== userId) cached.reset();
  cached.setStatus(cached.snapshot ? 'syncing' : 'loading');
  try {
    await synchronizePreparation();
    if (!usePreparationStore.getState().snapshot) {
      await commitSnapshot(userId, await fetchPreparation());
    }
  } catch (error) { await setPreparationError(error); }
}

export async function synchronizePreparation(): Promise<void> {
  if (activeSync) return activeSync;
  activeSync = runSync();
  try { await activeSync; } finally { activeSync = null; }
}

async function runSync(): Promise<void> {
  const userId = getMemoryAccountId();
  if (!userId) return;
  try {
    usePreparationStore.getState().setStatus('syncing');
    let snapshot = null;
    for (const action of (await readPreparationOutbox(userId)).slice(0, 50)) {
      snapshot = await submitSessionCompletion(action.sessionId, action.actionId, action.quality, action.occurredAt);
      await acknowledgePreparationAction(userId, action.actionId);
    }
    snapshot ??= await fetchPreparation();
    await commitSnapshot(userId, snapshot);
    usePreparationStore.getState().setPendingCount((await readPreparationOutbox(userId)).length);
  } catch (error) { await setPreparationError(error); }
}

export async function savePreparationProfile(profile: PreparationProfileInput): Promise<void> {
  const userId = requireUserId();
  usePreparationStore.getState().setStatus('syncing');
  try { await commitSnapshot(userId, await updatePreparationProfile(profile)); }
  catch (error) { await setPreparationError(error); throw error; }
}

export async function savePreparationDiagnostic(ratings: Record<string, number>): Promise<void> {
  const userId = requireUserId();
  usePreparationStore.getState().setStatus('syncing');
  try { await commitSnapshot(userId, await submitDiagnostic(ratings)); }
  catch (error) { await setPreparationError(error); throw error; }
}

export async function completePreparationSession(sessionId: string, quality: CompletionQuality): Promise<void> {
  requireUserId();
  const occurredAt = new Date().toISOString();
  const action = { actionId: createCompletionId(), sessionId, quality, occurredAt };
  usePreparationStore.getState().completeOptimistically(sessionId, quality, occurredAt);
  await enqueuePreparationCompletion(action);
  const userId = requireUserId();
  usePreparationStore.getState().setPendingCount((await readPreparationOutbox(userId)).length);
  await synchronizePreparation();
}

export async function manuallyRegeneratePreparation(): Promise<void> {
  const userId = requireUserId();
  usePreparationStore.getState().setStatus('syncing');
  try { await commitSnapshot(userId, await regeneratePreparationPlan()); }
  catch (error) { await setPreparationError(error); }
}

function requireUserId(): string {
  const userId = getMemoryAccountId();
  if (!userId) throw new Error('Войдите в аккаунт, чтобы сохранить персональный план');
  return userId;
}
async function setPreparationError(error: unknown): Promise<void> {
  const network = await NetInfo.fetch();
  const status = network.isConnected === false ? 'offline' : 'error';
  const message = error instanceof ApiAccountError && error.status === 401
    ? 'Сессия истекла. Войдите снова'
    : error instanceof Error ? error.message : 'Не удалось обновить план';
  usePreparationStore.getState().setStatus(status, message);
  if (error instanceof ApiAccountError && error.status === 401) {
    await cancelPreparationReminders().catch(() => undefined);
    usePreparationStore.getState().reset();
    useSessionStore.getState().setSignedOut();
  }
}

async function commitSnapshot(userId: string, snapshot: PreparationSnapshot): Promise<void> {
  usePreparationStore.getState().replaceSnapshot(userId, snapshot);
  void rescheduleReminders(snapshot).catch(() => undefined);
}
