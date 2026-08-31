import { useEffect, useState } from 'react';

import { vacancies } from '@/data/mock-data';
import { apiVacancyRepository } from '@/services/api-vacancy-repository';
import { cacheVacancy, readCachedVacancy } from '@/services/vacancy-cache';
import type { Vacancy } from '@/types/domain';
import { readCachedStatuses } from '@/services/vacancy-intelligence-cache';
import { getMemoryAccountId } from '@/services/session-memory';

export function useVacancyDetail(id?: string) {
  const [state, setState] = useState<{ id?: string; vacancy: Vacancy | null | undefined }>(() => ({
    id,
    vacancy: vacancies.find((item) => item.id === id),
  }));

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (!id) return;
    void (async () => {
      const accountId = getMemoryAccountId();
      const statusVacancy = accountId ? (await readCachedStatuses(accountId))?.find((item) => item.vacancyId === id)?.vacancy : null;
      const cached = await readCachedVacancy(id) ?? statusVacancy ?? null;
      if (!cancelled && cached) setState({ id, vacancy: cached });
      try {
        const live = await apiVacancyRepository.byId(id, controller.signal);
        if (!cancelled && live) {
          setState({ id, vacancy: live });
          await cacheVacancy(live);
        } else if (!cancelled && !cached && !vacancies.some((item) => item.id === id)) {
          setState({ id, vacancy: null });
        }
      } catch {
        if (!cancelled && !cached && !vacancies.some((item) => item.id === id)) setState({ id, vacancy: null });
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [id]);

  const vacancy = state.id === id ? state.vacancy : undefined;
  return { vacancy: id ? vacancy : null, loading: Boolean(id) && vacancy === undefined };
}
