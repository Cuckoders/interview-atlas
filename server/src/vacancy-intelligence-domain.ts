import type { PublicVacancy, Specialty, WorkFormat } from './domain.js';
import type { PreparationSessionKind } from './preparation-domain.js';

export const alertIntervals = [6, 24, 168] as const;
export type AlertIntervalHours = (typeof alertIntervals)[number];

export type SavedVacancySearch = {
  id: string;
  name: string;
  query?: string;
  specialty?: Specialty;
  workFormat?: WorkFormat;
  notificationsEnabled: boolean;
  intervalHours: AlertIntervalHours;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SavedVacancySearchInput = Omit<SavedVacancySearch, 'id' | 'lastCheckedAt' | 'createdAt' | 'updatedAt'>;

export type MatchComponent = {
  key: 'specialty' | 'level' | 'skills';
  label: string;
  score: number;
  maximum: number;
  explanation: string;
};

export type SkillGap = {
  skill: string;
  skillKey: string | null;
  currentScore: number | null;
  priority: 'high' | 'medium';
  reason: string;
};

export type VacancyMatch = {
  vacancyId: string;
  score: number;
  label: 'Сильное совпадение' | 'Стоит подготовиться' | 'Есть заметные пробелы';
  components: MatchComponent[];
  matchedSkills: string[];
  gaps: SkillGap[];
  calculatedAt: string;
};

export type VacancyPreparationSession = {
  id: string;
  kind: PreparationSessionKind;
  title: string;
  description: string;
  skill: string;
  durationMinutes: number;
  href: '/(tabs)/learn' | '/(tabs)/practice';
};

export type VacancyPreparationPlan = {
  vacancyId: string;
  vacancyTitle: string;
  company: string;
  matchScore: number;
  generatedAt: string;
  sessions: VacancyPreparationSession[];
};

export type SavedVacancyStatus = {
  vacancyId: string;
  status: 'active' | 'changed' | 'closed';
  changedFields: string[];
  vacancy: PublicVacancy | null;
  baselineUpdatedAt: string | null;
};

export type VacancyIntelligenceExport = {
  savedSearches: SavedVacancySearch[];
  vacancyPlans: VacancyPreparationPlan[];
};

export class VacancyIntelligenceError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode: number) { super(message); }
}
