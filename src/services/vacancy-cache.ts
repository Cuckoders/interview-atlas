import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CursorPage, VacancyQuery } from '@/services/contracts';
import type { Vacancy } from '@/types/domain';

const feedPrefix = '@interview-atlas/vacancy-feed/';
const itemPrefix = '@interview-atlas/vacancy/';

export async function readCachedVacancyPage(query: VacancyQuery): Promise<CursorPage<Vacancy> | null> {
  try {
    const raw = await AsyncStorage.getItem(feedKey(query));
    return raw ? JSON.parse(raw) as CursorPage<Vacancy> : null;
  } catch {
    return null;
  }
}

export async function cacheVacancyPage(query: VacancyQuery, page: CursorPage<Vacancy>): Promise<void> {
  const pairs: [string, string][] = [[feedKey(query), JSON.stringify(page)]];
  for (const item of page.items) pairs.push([`${itemPrefix}${item.id}`, JSON.stringify(item)]);
  try {
    await AsyncStorage.multiSet(pairs);
  } catch {
    // Кеш ускоряет и страхует ленту, но его сбой не должен ломать сетевой результат.
  }
}

export async function readCachedVacancy(id: string): Promise<Vacancy | null> {
  try {
    const raw = await AsyncStorage.getItem(`${itemPrefix}${id}`);
    return raw ? JSON.parse(raw) as Vacancy : null;
  } catch {
    return null;
  }
}

export async function cacheVacancy(item: Vacancy): Promise<void> {
  try {
    await AsyncStorage.setItem(`${itemPrefix}${item.id}`, JSON.stringify(item));
  } catch {
    // Детальная страница всё равно покажет сетевой результат.
  }
}

function feedKey(query: VacancyQuery): string {
  return `${feedPrefix}${encodeURIComponent(JSON.stringify({
    query: query.query?.trim() ?? '',
    specialty: query.specialty ?? '',
    workFormat: query.workFormat ?? '',
    limit: query.limit ?? 20,
  }))}`;
}
