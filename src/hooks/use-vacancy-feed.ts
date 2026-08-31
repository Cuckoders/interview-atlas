import { useCallback, useEffect, useRef, useState } from 'react';

import { vacancies } from '@/data/mock-data';
import { apiVacancyRepository } from '@/services/api-vacancy-repository';
import type { VacancyQuery } from '@/services/contracts';
import { cacheVacancyPage, readCachedVacancyPage } from '@/services/vacancy-cache';
import type { Vacancy } from '@/types/domain';

type VacancyFeed = {
  items: Vacancy[];
  syncedAt: string | null;
  stale: boolean;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => void;
  loadMore: () => void;
};

export function useVacancyFeed(query: VacancyQuery): VacancyFeed {
  const [items, setItems] = useState<Vacancy[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestId = useRef(0);
  const loadMoreController = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loadMoreController.current?.abort(); };
  }, []);

  const queryKey = JSON.stringify(query);
  useEffect(() => {
    const currentRequest = ++requestId.current;
    let cancelled = false;
    const controller = new AbortController();
    loadMoreController.current?.abort();
    const timer = setTimeout(() => {
      void (async () => {
        const cached = await readCachedVacancyPage(query);
        if (cancelled || currentRequest !== requestId.current) return;
        if (cached?.items.length) {
          setItems(cached.items);
          setSyncedAt(cached.syncedAt);
          setNextCursor(cached.nextCursor);
          setStale(true);
          setLoading(false);
        } else {
          setItems(filterDemoVacancies(query));
          setSyncedAt(null);
          setStale(true);
        }
        setRefreshing(refreshVersion > 0);
        try {
          const page = await apiVacancyRepository.search({ ...query, signal: controller.signal });
          if (cancelled || currentRequest !== requestId.current) return;
          setItems(page.items);
          setNextCursor(page.nextCursor);
          setSyncedAt(page.syncedAt);
          setStale(page.stale === true);
          setError(null);
          await cacheVacancyPage(query, page);
        } catch {
          if (controller.signal.aborted) return;
          if (cancelled || currentRequest !== requestId.current) return;
          setError('Не удалось обновить ленту. Показываем последние сохранённые данные.');
          setStale(true);
        } finally {
          if (!cancelled && currentRequest === requestId.current) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      })();
    }, refreshVersion > 0 ? 0 : 350);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [query, queryKey, refreshVersion]); // queryKey документирует смену семантики фильтров.

  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshVersion((value) => value + 1);
  }, []);
  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    loadMoreController.current?.abort();
    const controller = new AbortController();
    loadMoreController.current = controller;
    setLoadingMore(true);
    void apiVacancyRepository.search({ ...query, cursor: nextCursor, signal: controller.signal })
      .then(async (page) => {
        if (controller.signal.aborted) return;
        setItems((current) => deduplicate([...current, ...page.items]));
        setNextCursor(page.nextCursor);
        setSyncedAt(page.syncedAt);
        setStale(page.stale === true);
        setError(null);
        await cacheVacancyPage(query, { ...page, items: deduplicate([...items, ...page.items]) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Не удалось загрузить следующую страницу. Попробуйте ещё раз.');
      })
      .finally(() => {
        if (mounted.current) setLoadingMore(false);
      });
  }, [items, loadingMore, nextCursor, query]);

  return { items, syncedAt, stale, loading, refreshing, loadingMore, error, hasMore: nextCursor !== null, refresh, loadMore };
}

function filterDemoVacancies(query: VacancyQuery): Vacancy[] {
  const normalized = query.query?.trim().toLocaleLowerCase('ru') ?? '';
  return vacancies
    .filter((item) => !query.specialty || item.specialty === query.specialty)
    .filter((item) => !query.workFormat || item.workFormat === query.workFormat)
    .filter((item) => !normalized || `${item.title} ${item.company} ${item.skills.join(' ')}`.toLocaleLowerCase('ru').includes(normalized))
    .slice(0, query.limit ?? 20);
}

function deduplicate(items: Vacancy[]): Vacancy[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}
