import { useCallback, useEffect, useState } from 'react';

import { acknowledgeSavedVacancyStatus, fetchSavedVacancyStatuses } from '@/services/vacancy-intelligence-api';
import { cacheStatuses, readCachedStatuses } from '@/services/vacancy-intelligence-cache';
import { useSessionStore } from '@/store/use-session-store';
import type { SavedVacancyStatus } from '@/types/vacancy-intelligence';
import { cacheVacancy } from '@/services/vacancy-cache';

export function useSavedVacancyStatuses() {
  const user = useSessionStore((state) => state.user);
  const [items, setItems] = useState<SavedVacancyStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!user) { setItems([]); return; }
    setLoading(true);
    const cached = await readCachedStatuses(user.id);
    if (cached) {
      setItems(cached);
      await Promise.all(cached.flatMap((item) => item.vacancy ? [cacheVacancy(item.vacancy)] : []));
    }
    try {
      const result = await fetchSavedVacancyStatuses();
      setItems(result.items); setError(null);
      await Promise.all(result.items.flatMap((item) => item.vacancy ? [cacheVacancy(item.vacancy)] : []));
      await cacheStatuses(user.id, result.items);
    } catch { setError('Статусы сохранённых вакансий временно недоступны.'); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  const acknowledge = useCallback(async (vacancyId: string) => {
    if (!user) return;
    const next = await acknowledgeSavedVacancyStatus(vacancyId);
    setItems((current) => current.map((item) => item.vacancyId === vacancyId ? next : item));
    const cached = await readCachedStatuses(user.id) ?? [];
    await cacheStatuses(user.id, cached.map((item) => item.vacancyId === vacancyId ? next : item));
  }, [user]);
  return { items, loading, error, refresh: load, acknowledge };
}
