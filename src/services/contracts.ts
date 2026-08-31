import type {
  InterviewQuestion,
  LearningTrack,
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
  questions(specialty: Specialty, cursor?: string, signal?: AbortSignal): Promise<CursorPage<InterviewQuestion>>;
  tasks(specialty: Specialty, cursor?: string, signal?: AbortSignal): Promise<CursorPage<PracticeTask>>;
  videos(specialty: Specialty, cursor?: string, signal?: AbortSignal): Promise<CursorPage<VideoLesson>>;
  tracks(specialty: Specialty, cursor?: string, signal?: AbortSignal): Promise<CursorPage<LearningTrack>>;
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
