import AsyncStorage from '@react-native-async-storage/async-storage';

import { getMemoryAccountId } from '@/services/session-memory';
import type { PreparationCompletion } from '@/types/preparation';

let wakeup: (() => void) | null = null;
const key = (userId: string) => `interview-atlas-preparation-outbox-v1:${userId}`;

export function setPreparationSyncWakeup(next: (() => void) | null): void { wakeup = next; }
export async function enqueuePreparationCompletion(action: PreparationCompletion): Promise<void> {
  const userId = getMemoryAccountId();
  if (!userId) throw new Error('Требуется вход в аккаунт');
  const actions = await readPreparationOutbox(userId);
  if (!actions.some((item) => item.actionId === action.actionId)) actions.push(action);
  await AsyncStorage.setItem(key(userId), JSON.stringify(actions));
  wakeup?.();
}
export async function readPreparationOutbox(userId: string): Promise<PreparationCompletion[]> {
  const raw = await AsyncStorage.getItem(key(userId));
  if (!raw) return [];
  try { return JSON.parse(raw) as PreparationCompletion[]; } catch { return []; }
}
export async function acknowledgePreparationAction(userId: string, actionId: string): Promise<void> {
  const remaining = (await readPreparationOutbox(userId)).filter((item) => item.actionId !== actionId);
  if (remaining.length) await AsyncStorage.setItem(key(userId), JSON.stringify(remaining));
  else await AsyncStorage.removeItem(key(userId));
}
export async function clearPreparationOutbox(userId: string): Promise<void> { await AsyncStorage.removeItem(key(userId)); }

export function createCompletionId(): string {
  return `prep:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
}
