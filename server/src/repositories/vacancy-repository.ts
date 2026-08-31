import type { Vacancy, VacancySearch } from '../domain.js';

export interface VacancyRepository {
  upsertMany(items: Vacancy[]): Promise<void>;
  search(query: VacancySearch): Promise<Vacancy[]>;
  findById(id: string): Promise<Vacancy | null>;
  count(): Promise<number>;
  close(): Promise<void>;
}
