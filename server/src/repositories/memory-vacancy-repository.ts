import type { Vacancy, VacancySearch } from '../domain.js';
import type { VacancyRepository } from './vacancy-repository.js';

export class MemoryVacancyRepository implements VacancyRepository {
  private readonly items = new Map<string, Vacancy>();

  async upsertMany(items: Vacancy[]): Promise<void> {
    for (const item of items) this.items.set(item.id, item);
  }

  async search(query: VacancySearch): Promise<Vacancy[]> {
    const normalized = query.query?.trim().toLocaleLowerCase('ru') ?? '';
    return [...this.items.values()]
      .filter((item) => !query.specialty || item.specialty === query.specialty)
      .filter((item) => !query.workFormat || item.workFormat === query.workFormat)
      .filter((item) => {
        if (!normalized) return true;
        return `${item.title} ${item.company} ${item.skills.join(' ')} ${item.location}`
          .toLocaleLowerCase('ru').includes(normalized);
      })
      .filter((item) => !query.cursor || compareWithCursor(item, query.cursor) < 0)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id))
      .slice(0, query.limit + 1);
  }

  async findById(id: string): Promise<Vacancy | null> {
    return this.items.get(id) ?? null;
  }

  async count(): Promise<number> {
    return this.items.size;
  }

  remove(id: string): void { this.items.delete(id); }

  async close(): Promise<void> {}
}

function compareWithCursor(item: Vacancy, cursor: NonNullable<VacancySearch['cursor']>): number {
  return item.publishedAt.localeCompare(cursor.publishedAt) || item.id.localeCompare(cursor.id);
}
