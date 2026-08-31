export const specialties = ['Frontend', 'Backend', 'Mobile', 'QA'] as const;
export type Specialty = (typeof specialties)[number];

export const workFormats = ['Удалённо', 'Гибрид', 'Офис'] as const;
export type WorkFormat = (typeof workFormats)[number];

export type Vacancy = {
  id: string;
  externalId: string;
  title: string;
  company: string;
  location: string;
  workFormat: WorkFormat;
  salary?: string;
  level: string;
  specialty: Specialty;
  skills: string[];
  description: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  collectedAt: string;
  rawPayload: unknown;
};

export type PublicVacancy = Omit<Vacancy, 'externalId' | 'rawPayload'>;

export type VacancyCursor = { publishedAt: string; id: string };

export type VacancySearch = {
  query?: string;
  specialty?: Specialty;
  workFormat?: WorkFormat;
  cursor?: VacancyCursor;
  limit: number;
};

export type VacancyPage = {
  items: PublicVacancy[];
  nextCursor: string | null;
  syncedAt: string;
  stale: boolean;
};
