import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CursorPage } from '@/services/contracts';
import type { LearningContent, LearningContentMap, LearningContentType } from '@/services/api-learning-repository';
import type { Specialty } from '@/types/domain';

const feedPrefix = '@interview-atlas/content-feed/';
const itemPrefix = '@interview-atlas/content/';

export async function readLearningPage<K extends LearningContentType>(
  type: K, specialty: Specialty,
): Promise<CursorPage<LearningContentMap[K]> | null> {
  try {
    const raw = await AsyncStorage.getItem(`${feedPrefix}${type}/${specialty}`);
    return raw ? JSON.parse(raw) as CursorPage<LearningContentMap[K]> : null;
  } catch { return null; }
}

export async function cacheLearningPage<K extends LearningContentType>(
  type: K, specialty: Specialty, page: CursorPage<LearningContentMap[K]>,
): Promise<void> {
  const pairs: [string, string][] = [[`${feedPrefix}${type}/${specialty}`, JSON.stringify(page)]];
  for (const item of page.items) pairs.push([`${itemPrefix}${item.id}`, JSON.stringify({ type, item })]);
  try { await AsyncStorage.multiSet(pairs); } catch { /* Сбой кеша не ломает сетевой контент. */ }
}

export async function readLearningItem(id: string): Promise<{ type: LearningContentType; item: LearningContent } | null> {
  try {
    const raw = await AsyncStorage.getItem(`${itemPrefix}${id}`);
    return raw ? JSON.parse(raw) as { type: LearningContentType; item: LearningContent } : null;
  } catch { return null; }
}

export async function cacheLearningItem(type: LearningContentType, item: LearningContent): Promise<void> {
  try { await AsyncStorage.setItem(`${itemPrefix}${item.id}`, JSON.stringify({ type, item })); } catch { /* optional cache */ }
}
