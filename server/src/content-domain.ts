import type { Specialty } from './domain.js';

export const contentTypes = ['question', 'task', 'video', 'track'] as const;
export type ContentType = (typeof contentTypes)[number];

export const contentStatuses = ['draft', 'review', 'published', 'archived'] as const;
export type ContentStatus = (typeof contentStatuses)[number];

export const difficulties = ['Начальный', 'Средний', 'Продвинутый'] as const;
export type Difficulty = (typeof difficulties)[number];

export type QuestionPayload = { shortAnswer: string; fullAnswer: string; difficulty: Difficulty };
export type TaskPayload = {
  description: string; difficulty: Difficulty; estimatedMinutes: number; skills: string[];
  starterCode?: string | undefined; solution: string;
  runner?: import('./learning-lab-domain.js').TaskRunnerConfig | undefined;
};
export type VideoPayload = {
  author: string; durationMinutes: number; url: string;
  quiz?: import('./learning-lab-domain.js').QuizQuestion[] | undefined;
};
export type TrackPayload = { description: string; lessons: number; durationMinutes: number };
export type ContentPayload = QuestionPayload | TaskPayload | VideoPayload | TrackPayload;

export type ContentInput = {
  type: ContentType;
  specialty: Specialty;
  title: string;
  tags: string[];
  sourceLabel: string;
  sourceUrl?: string | undefined;
  nextReviewAt: string;
  editor: string;
  payload: ContentPayload;
};

export type ContentRevision = ContentInput & {
  id: string;
  version: number;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};
export type PublicContentRevision = Omit<ContentRevision, 'payload'> & { payload: Record<string, unknown> };

export type ContentCursor = { publishedAt: string; id: string };
export type PublishedContentQuery = {
  type?: ContentType;
  specialty?: Specialty;
  cursor?: ContentCursor;
  limit: number;
};
export type AdminContentQuery = {
  type?: ContentType;
  specialty?: Specialty;
  status?: ContentStatus;
  limit: number;
};

export class ContentError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ContentError';
  }
}
