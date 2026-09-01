import AsyncStorage from '@react-native-async-storage/async-storage';

import type { InterviewSimulation, VideoProgress } from '@/types/learning-lab';

const prefix = '@interview-atlas/learning-lab/';
const ownerKey = `${prefix}last-owner`;
let rememberedOwner: string | null = null;
let cacheMutationChain: Promise<void> = Promise.resolve();
const purgedOwners = new Set<string>();

function mutateCache(operation: () => Promise<void>): Promise<void> {
  const result = cacheMutationChain.then(operation);
  cacheMutationChain = result.catch(() => undefined);
  return result;
}

export function getLearningCacheOwner(): string | null { return rememberedOwner; }
export async function hydrateLearningCacheOwner(): Promise<string | null> {
  if (rememberedOwner) return rememberedOwner;
  try { rememberedOwner = await AsyncStorage.getItem(ownerKey); } catch {}
  return rememberedOwner;
}
export async function rememberLearningCacheOwner(owner: string): Promise<void> {
  rememberedOwner = owner;
  purgedOwners.delete(owner);
  try { await AsyncStorage.setItem(ownerKey, owner); } catch {}
}
export async function forgetLearningCacheOwner(): Promise<void> {
  rememberedOwner = null;
  try { await AsyncStorage.removeItem(ownerKey); } catch {}
}

export async function readCachedVideoProgress(owner: string, videoId: string, contentVersion: number): Promise<VideoProgress | null> {
  try { const value = await AsyncStorage.getItem(`${prefix}video/${owner}/${videoId}/${contentVersion}`); return value ? JSON.parse(value) as VideoProgress : null; }
  catch { return null; }
}
export async function cacheVideoProgress(owner: string, value: VideoProgress): Promise<void> {
  if (purgedOwners.has(owner)) return;
  await mutateCache(async () => {
    if (purgedOwners.has(owner)) return;
    try { await AsyncStorage.setItem(`${prefix}video/${owner}/${value.videoId}/${value.contentVersion}`, JSON.stringify(value)); } catch {}
  });
}
export async function clearCachedVideoProgress(owner: string, videoId: string, contentVersion: number): Promise<void> {
  await mutateCache(async () => {
    try { await AsyncStorage.removeItem(`${prefix}video/${owner}/${videoId}/${contentVersion}`); } catch {}
  });
}
export async function readCachedSimulation(owner: string): Promise<InterviewSimulation | null> {
  try { const value = await AsyncStorage.getItem(`${prefix}simulation/${owner}`); return value ? JSON.parse(value) as InterviewSimulation : null; }
  catch { return null; }
}
export async function cacheSimulation(owner: string, value: InterviewSimulation): Promise<void> {
  if (purgedOwners.has(owner)) return;
  await mutateCache(async () => {
    if (purgedOwners.has(owner)) return;
    try { await AsyncStorage.setItem(`${prefix}simulation/${owner}`, JSON.stringify(value)); } catch {}
  });
}
export async function clearCachedSimulation(owner: string): Promise<void> {
  await mutateCache(async () => {
    try { await AsyncStorage.removeItem(`${prefix}simulation/${owner}`); } catch {}
  });
}
export async function purgeLearningCache(owner: string): Promise<void> {
  purgedOwners.add(owner);
  await mutateCache(async () => {
    try {
      const videoPrefix = `${prefix}video/${owner}/`;
      const simulationKey = `${prefix}simulation/${owner}`;
      const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(videoPrefix) || key === simulationKey);
      if (keys.length) await AsyncStorage.multiRemove(keys);
    } catch { /* Удаление аккаунта не должно зависеть от доступности необязательного кеша. */ }
  });
}
