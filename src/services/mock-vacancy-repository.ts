import { vacancies } from '@/data/mock-data';
import type { CursorPage, VacancyQuery, VacancyRepository } from '@/services/contracts';
import type { Vacancy } from '@/types/domain';

export class MockVacancyRepository implements VacancyRepository {
  async search(query: VacancyQuery): Promise<CursorPage<Vacancy>> {
    const normalized = query.query?.trim().toLocaleLowerCase('ru') ?? '';
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const items = vacancies
      .filter((item) => !query.specialty || item.specialty === query.specialty)
      .filter((item) => !query.workFormat || item.workFormat === query.workFormat)
      .filter((item) => {
        if (!normalized) return true;
        return `${item.title} ${item.company} ${item.skills.join(' ')}`
          .toLocaleLowerCase('ru')
          .includes(normalized);
      })
      .slice(0, limit);

    return { items, nextCursor: null, syncedAt: new Date().toISOString() };
  }

  async byId(id: string): Promise<Vacancy | null> {
    return vacancies.find((item) => item.id === id) ?? null;
  }
}
