import type { PublicVacancy } from '../domain.js';
import type {
  SavedVacancySearch,
  SavedVacancySearchInput,
  VacancyPreparationPlan,
} from '../vacancy-intelligence-domain.js';

export type VacancyBaseline = { vacancy: PublicVacancy; fingerprint: string; updatedAt: string };

export interface VacancyIntelligenceRepository {
  listSearches(userId: string): Promise<SavedVacancySearch[]>;
  createSearch(userId: string, id: string, input: SavedVacancySearchInput): Promise<SavedVacancySearch>;
  updateSearch(userId: string, id: string, input: SavedVacancySearchInput): Promise<SavedVacancySearch | null>;
  deleteSearch(userId: string, id: string): Promise<boolean>;
  claimNotifications(userId: string, searchId: string, vacancyIds: string[], checkedAt: string): Promise<string[]>;
  getBaseline(userId: string, vacancyId: string): Promise<VacancyBaseline | null>;
  saveBaseline(userId: string, vacancyId: string, vacancy: PublicVacancy, fingerprint: string): Promise<VacancyBaseline>;
  getPlan(userId: string, vacancyId: string): Promise<VacancyPreparationPlan | null>;
  savePlan(userId: string, plan: VacancyPreparationPlan): Promise<VacancyPreparationPlan>;
  listPlans(userId: string): Promise<VacancyPreparationPlan[]>;
  close(): Promise<void>;
}
