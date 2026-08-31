import type {
  InterviewQuestion,
  PracticeTask,
  Specialty,
  Vacancy,
  VideoLesson,
} from '@/types/domain';

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
  syncedAt: string;
  stale?: boolean;
};

export type VacancyQuery = {
  query?: string;
  specialty?: Specialty;
  workFormat?: Vacancy['workFormat'];
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
};

export interface LearningRepository {
  questions(specialty: Specialty, cursor?: string): Promise<CursorPage<InterviewQuestion>>;
  tasks(specialty: Specialty, cursor?: string): Promise<CursorPage<PracticeTask>>;
  videos(specialty: Specialty, cursor?: string): Promise<CursorPage<VideoLesson>>;
}

export interface VacancyRepository {
  search(query: VacancyQuery): Promise<CursorPage<Vacancy>>;
  byId(id: string, signal?: AbortSignal): Promise<Vacancy | null>;
}

export type VacancySourceRecord = {
  source: string;
  externalId: string;
  sourceUrl: string;
  payload: unknown;
  fetchedAt: string;
};

export type VacancySourceAdapter = {
  source: string;
  fetchPage(cursor?: string): Promise<{
    records: VacancySourceRecord[];
    nextCursor: string | null;
  }>;
};
