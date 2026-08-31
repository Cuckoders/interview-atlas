import { Platform } from 'react-native';

import type { CursorPage, VacancyQuery, VacancyRepository } from '@/services/contracts';
import type { Specialty, Vacancy } from '@/types/domain';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
const defaultApiUrl = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://127.0.0.1:4000';
export const apiBaseUrl = (configuredApiUrl || defaultApiUrl).replace(/\/$/, '');

const specialties: Specialty[] = ['Frontend', 'Backend', 'Mobile', 'QA'];
const workFormats: Vacancy['workFormat'][] = ['Удалённо', 'Гибрид', 'Офис'];

export class ApiVacancyRepository implements VacancyRepository {
  async search(query: VacancyQuery): Promise<CursorPage<Vacancy>> {
    const params = new URLSearchParams();
    if (query.query?.trim()) params.set('query', query.query.trim());
    if (query.specialty) params.set('specialty', query.specialty);
    if (query.workFormat) params.set('workFormat', query.workFormat);
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.limit) params.set('limit', String(query.limit));
    const payload = await fetchJson(`${apiBaseUrl}/v1/vacancies?${params.toString()}`, query.signal);
    if (!isCursorPage(payload)) throw new Error('Backend вернул неизвестный формат вакансий');
    return payload;
  }

  async byId(id: string, signal?: AbortSignal): Promise<Vacancy | null> {
    try {
      const payload = await fetchJson(`${apiBaseUrl}/v1/vacancies/${encodeURIComponent(id)}`, signal);
      if (!isVacancy(payload)) throw new Error('Backend вернул неизвестный формат вакансии');
      return payload;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return null;
      throw error;
    }
  }
}

async function fetchJson(url: string, externalSignal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const abort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new ApiRequestError(response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abort);
  }
}

class ApiRequestError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with ${status}`);
  }
}

function isCursorPage(value: unknown): value is CursorPage<Vacancy> {
  if (!isRecord(value) || !Array.isArray(value.items) || !value.items.every(isVacancy)) return false;
  return (typeof value.nextCursor === 'string' || value.nextCursor === null) &&
    typeof value.syncedAt === 'string' &&
    (value.stale === undefined || typeof value.stale === 'boolean');
}

function isVacancy(value: unknown): value is Vacancy {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && typeof value.title === 'string' &&
    typeof value.company === 'string' && typeof value.location === 'string' &&
    workFormats.includes(value.workFormat as Vacancy['workFormat']) &&
    typeof value.level === 'string' && specialties.includes(value.specialty as Specialty) &&
    Array.isArray(value.skills) && value.skills.every((skill) => typeof skill === 'string') &&
    typeof value.description === 'string' && typeof value.source === 'string' &&
    typeof value.sourceUrl === 'string' && isHttpsUrl(value.sourceUrl) && typeof value.publishedAt === 'string' &&
    typeof value.collectedAt === 'string' &&
    (value.salary === undefined || typeof value.salary === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export const apiVacancyRepository = new ApiVacancyRepository();
