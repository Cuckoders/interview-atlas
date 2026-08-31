import type { PublicVacancy } from '../domain.js';
import type { SavedVacancySearch, SavedVacancySearchInput, VacancyPreparationPlan } from '../vacancy-intelligence-domain.js';
import type { VacancyBaseline, VacancyIntelligenceRepository } from './vacancy-intelligence-repository.js';

export class MemoryVacancyIntelligenceRepository implements VacancyIntelligenceRepository {
  private readonly searches = new Map<string, Map<string, ReturnType<typeof searchRecord>>>();
  private readonly deliveries = new Set<string>();
  private readonly baselines = new Map<string, VacancyBaseline>();
  private readonly plans = new Map<string, VacancyPreparationPlan>();

  async listSearches(userId: string) {
    return clone([...this.userSearches(userId).values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async createSearch(userId: string, id: string, input: SavedVacancySearchInput) {
    const value = searchRecord(id, input);
    this.userSearches(userId).set(id, value);
    return clone(value);
  }

  async updateSearch(userId: string, id: string, input: SavedVacancySearchInput) {
    const current = this.userSearches(userId).get(id);
    if (!current) return null;
    const value = { ...current, ...input, updatedAt: new Date().toISOString() };
    this.userSearches(userId).set(id, value);
    return clone(value);
  }

  async deleteSearch(userId: string, id: string) { return this.userSearches(userId).delete(id); }

  async claimNotifications(userId: string, searchId: string, vacancyIds: string[], checkedAt: string) {
    const search = this.userSearches(userId).get(searchId);
    if (!search) return [];
    search.lastCheckedAt = checkedAt;
    const claimed: string[] = [];
    for (const vacancyId of vacancyIds) {
      const key = `${userId}:${searchId}:${vacancyId}`;
      if (this.deliveries.has(key)) continue;
      this.deliveries.add(key);
      claimed.push(vacancyId);
    }
    return claimed;
  }

  async getBaseline(userId: string, vacancyId: string) { return clone(this.baselines.get(key(userId, vacancyId)) ?? null); }
  async saveBaseline(userId: string, vacancyId: string, vacancy: PublicVacancy, fingerprint: string) {
    const value = { vacancy: clone(vacancy), fingerprint, updatedAt: new Date().toISOString() };
    this.baselines.set(key(userId, vacancyId), value);
    return clone(value);
  }
  async getPlan(userId: string, vacancyId: string) { return clone(this.plans.get(key(userId, vacancyId)) ?? null); }
  async savePlan(userId: string, plan: VacancyPreparationPlan) {
    this.plans.set(key(userId, plan.vacancyId), clone(plan));
    return clone(plan);
  }
  async listPlans(userId: string) {
    return clone([...this.plans.entries()].filter(([entry]) => entry.startsWith(`${userId}:`)).map(([, value]) => value));
  }
  async close() {}

  private userSearches(userId: string) {
    let values = this.searches.get(userId);
    if (!values) { values = new Map(); this.searches.set(userId, values); }
    return values;
  }
}

function searchRecord(id: string, input: SavedVacancySearchInput): SavedVacancySearch {
  const now = new Date().toISOString();
  return { id, ...input, lastCheckedAt: null, createdAt: now, updatedAt: now };
}
function key(userId: string, itemId: string) { return `${userId}:${itemId}`; }
function clone<T>(value: T): T { return value === null ? value : structuredClone(value); }
