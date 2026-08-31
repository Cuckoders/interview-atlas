import AsyncStorage from '@react-native-async-storage/async-storage';

import { getMemoryAccountId } from '@/services/session-memory';
import type { ProgressAction } from '@/types/account';

let mutationChain: Promise<void> = Promise.resolve();
let wakeup: (() => void) | null = null;

export function setSyncWakeup(callback: (() => void) | null): void { wakeup = callback; }

export function enqueueProgressAction(action: Omit<ProgressAction, 'id' | 'occurredAt'>): void {
  const userId = getMemoryAccountId();
  if (!userId) return;
  const item: ProgressAction = { ...action, id: createActionId(), occurredAt: new Date().toISOString() };
  void mutateOutbox(async () => {
    const current = await readOutboxUnsafe(userId);
    await AsyncStorage.setItem(key(userId), JSON.stringify([...current, item]));
  }).then(() => wakeup?.()).catch(() => undefined);
}

export async function appendProgressActions(userId: string, actions: ProgressAction[]): Promise<void> {
  await mutateOutbox(async () => {
    const current = await readOutboxUnsafe(userId);
    await AsyncStorage.setItem(key(userId), JSON.stringify([...current, ...actions]));
  });
}

export async function prependProgressActions(userId: string, actions: ProgressAction[]): Promise<void> {
  await mutateOutbox(async () => {
    const current = await readOutboxUnsafe(userId);
    await AsyncStorage.setItem(key(userId), JSON.stringify([...actions, ...current]));
  });
}

export async function readOutbox(userId: string): Promise<ProgressAction[]> {
  await mutationChain;
  return readOutboxUnsafe(userId);
}

async function readOutboxUnsafe(userId: string): Promise<ProgressAction[]> {
  const raw = await AsyncStorage.getItem(key(userId));
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as ProgressAction[];
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export async function acknowledgeActions(userId: string, ids: string[]): Promise<void> {
  await mutateOutbox(async () => {
    const acknowledged = new Set(ids);
    const remaining = (await readOutboxUnsafe(userId)).filter((item) => !acknowledged.has(item.id));
    await AsyncStorage.setItem(key(userId), JSON.stringify(remaining));
  });
}

export async function clearOutbox(userId: string): Promise<void> {
  await mutateOutbox(() => AsyncStorage.removeItem(key(userId)));
}

export function createProgressAction(
  type: ProgressAction['type'], value: ProgressAction['value'], targetId?: string,
): ProgressAction {
  return { id: createActionId(), type, value, ...(targetId ? { targetId } : {}), occurredAt: new Date().toISOString() };
}

function key(userId: string): string { return `interview-atlas.sync-outbox.v1:${userId}`; }

function mutateOutbox(operation: () => Promise<void>): Promise<void> {
  const result = mutationChain.then(operation);
  mutationChain = result.catch(() => undefined);
  return result;
}

function createActionId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`;
}
