import type { Specialty, Vacancy } from '@/types/domain';

export type AlertIntervalHours = 6 | 24 | 168;
export type SavedVacancySearch = {
  id: string;
  name: string;
  query?: string;
  specialty?: Specialty;
  workFormat?: Vacancy['workFormat'];
  notificationsEnabled: boolean;
  intervalHours: AlertIntervalHours;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type SavedVacancySearchInput = Omit<SavedVacancySearch, 'id' | 'lastCheckedAt' | 'createdAt' | 'updatedAt'>;

export type VacancyMatch = {
  vacancyId: string;
  score: number;
  label: 'Сильное совпадение' | 'Стоит подготовиться' | 'Есть заметные пробелы';
  components: { key: 'specialty' | 'level' | 'skills'; label: string; score: number; maximum: number; explanation: string }[];
  matchedSkills: string[];
  gaps: { skill: string; skillKey: string | null; currentScore: number | null; priority: 'high' | 'medium'; reason: string }[];
  calculatedAt: string;
};

export type VacancyPreparationPlan = {
  vacancyId: string;
  vacancyTitle: string;
  company: string;
  matchScore: number;
  generatedAt: string;
  sessions: {
    id: string; kind: 'theory' | 'question' | 'practice' | 'review'; title: string;
    description: string; skill: string; durationMinutes: number; href: '/(tabs)/learn' | '/(tabs)/practice';
  }[];
};

export type SavedVacancyStatus = {
  vacancyId: string;
  status: 'active' | 'changed' | 'closed';
  changedFields: string[];
  vacancy: Vacancy | null;
  baselineUpdatedAt: string | null;
};

export type VacancyAlertCheck = {
  checkedAt: string;
  totalNew: number;
  searches: { search: SavedVacancySearch; newCount: number; items: Vacancy[] }[];
};
