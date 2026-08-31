import type { VacancySourceAdapter } from '../adapters/arbeitnow-adapter.js';
import { encodeCursor } from '../cursor.js';
import type { PublicVacancy, Vacancy, VacancyPage, VacancySearch } from '../domain.js';
import { normalizeArbeitnowJob } from '../normalization.js';
import type { VacancyRepository } from '../repositories/vacancy-repository.js';

export class VacancyService {
  private lastSuccessfulSync: string | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    private readonly repository: VacancyRepository,
    private readonly adapter: VacancySourceAdapter,
    private readonly refreshMs: number,
  ) {}

  async search(query: VacancySearch): Promise<VacancyPage> {
    let stale = false;
    try {
      await this.ensureFresh();
    } catch (error) {
      if (await this.repository.count() === 0) throw error;
      stale = true;
    }
    const rows = await this.repository.search(query);
    const hasNext = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map(toPublicVacancy);
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasNext && last ? encodeCursor({ publishedAt: last.publishedAt, id: last.id }) : null,
      syncedAt: this.lastSuccessfulSync ?? items[0]?.collectedAt ?? new Date(0).toISOString(),
      stale,
    };
  }

  async byId(id: string): Promise<PublicVacancy | null> {
    const item = await this.repository.findById(id);
    return item ? toPublicVacancy(item) : null;
  }

  async stats(): Promise<{ count: number; syncedAt: string | null; storage: 'memory' | 'postgres' }> {
    return {
      count: await this.repository.count(),
      syncedAt: this.lastSuccessfulSync,
      storage: this.repository.constructor.name.startsWith('Postgres') ? 'postgres' : 'memory',
    };
  }

  async close(): Promise<void> { await this.repository.close(); }

  private async ensureFresh(): Promise<void> {
    const age = this.lastSuccessfulSync ? Date.now() - Date.parse(this.lastSuccessfulSync) : Number.POSITIVE_INFINITY;
    if (age < this.refreshMs) return;
    if (!this.refreshPromise) this.refreshPromise = this.refresh().finally(() => { this.refreshPromise = null; });
    await this.refreshPromise;
  }

  private async refresh(): Promise<void> {
    const collectedAt = new Date().toISOString();
    const jobs = await this.adapter.fetchLatest();
    const normalized = jobs
      .map((job) => normalizeArbeitnowJob(job, collectedAt))
      .filter((item): item is Vacancy => item !== null);
    await this.repository.upsertMany(normalized);
    this.lastSuccessfulSync = collectedAt;
  }
}

function toPublicVacancy(item: Vacancy): PublicVacancy {
  const { rawPayload: _, externalId: __, ...publicItem } = item;
  return publicItem;
}
