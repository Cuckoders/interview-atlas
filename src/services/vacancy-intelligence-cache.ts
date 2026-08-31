import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SavedVacancySearch, SavedVacancyStatus, VacancyMatch, VacancyPreparationPlan } from '@/types/vacancy-intelligence';

const PREFIX = 'interview-atlas-vacancy-intelligence-v1';

export const readCachedSearches = (userId: string) => read<SavedVacancySearch[]>(`${PREFIX}:searches:${userId}`);
export const cacheSearches = (userId: string, value: SavedVacancySearch[]) => write(`${PREFIX}:searches:${userId}`, value);
export const readCachedStatuses = (userId: string) => read<SavedVacancyStatus[]>(`${PREFIX}:statuses:${userId}`);
export const cacheStatuses = (userId: string, value: SavedVacancyStatus[]) => write(`${PREFIX}:statuses:${userId}`, value);
export const readCachedMatch = (userId: string, vacancyId: string) => read<VacancyMatch>(`${PREFIX}:match:${userId}:${vacancyId}`);
export const cacheMatch = (userId: string, vacancyId: string, value: VacancyMatch) => write(`${PREFIX}:match:${userId}:${vacancyId}`, value);
export const readCachedVacancyPlan = (userId: string, vacancyId: string) => read<VacancyPreparationPlan>(`${PREFIX}:plan:${userId}:${vacancyId}`);
export const cacheVacancyPlan = (userId: string, vacancyId: string, value: VacancyPreparationPlan) => write(`${PREFIX}:plan:${userId}:${vacancyId}`, value);

async function read<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
function write(key: string, value: unknown) { return AsyncStorage.setItem(key, JSON.stringify(value)); }
