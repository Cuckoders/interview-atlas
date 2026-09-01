import type { CursorPage, LearningRepository } from '@/services/contracts';
import { apiBaseUrl } from '@/services/api-vacancy-repository';
import type { InterviewQuestion, LearningTrack, PracticeTask, Specialty, VideoLesson } from '@/types/domain';

export type LearningContentMap = {
  question: InterviewQuestion;
  task: PracticeTask;
  video: VideoLesson;
  track: LearningTrack;
};
export type LearningContentType = keyof LearningContentMap;
export type LearningContent = LearningContentMap[LearningContentType];

type CmsItem = {
  id: string; type: LearningContentType; specialty: Specialty; title: string; tags: string[];
  sourceLabel: string; version: number; updatedAt: string; payload: Record<string, unknown>;
};

export class ApiLearningRepository implements LearningRepository {
  questions(specialty: Specialty, cursor?: string, signal?: AbortSignal) {
    return this.list('question', specialty, cursor, signal);
  }
  tasks(specialty: Specialty, cursor?: string, signal?: AbortSignal) {
    return this.list('task', specialty, cursor, signal);
  }
  videos(specialty: Specialty, cursor?: string, signal?: AbortSignal) {
    return this.list('video', specialty, cursor, signal);
  }
  tracks(specialty: Specialty, cursor?: string, signal?: AbortSignal) {
    return this.list('track', specialty, cursor, signal);
  }

  async list<K extends LearningContentType>(
    type: K, specialty: Specialty, cursor?: string, signal?: AbortSignal,
  ): Promise<CursorPage<LearningContentMap[K]>> {
    const params = new URLSearchParams({ type, specialty, limit: '50' });
    if (cursor) params.set('cursor', cursor);
    const response = await fetchWithTimeout(`${apiBaseUrl}/v1/content?${params}`, signal);
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.items) ||
      (typeof payload.nextCursor !== 'string' && payload.nextCursor !== null) || typeof payload.syncedAt !== 'string') {
      throw new Error('Backend вернул неизвестный формат контента');
    }
    const items = payload.items.map(parseCmsItem).filter((item) => item.type === type).map(mapItem) as LearningContentMap[K][];
    return { items, nextCursor: payload.nextCursor, syncedAt: payload.syncedAt };
  }

  async byId(id: string, signal?: AbortSignal): Promise<LearningContent | null> {
    const response = await fetchWithTimeout(`${apiBaseUrl}/v1/content/${encodeURIComponent(id)}`, signal, true);
    if (response.status === 404) return null;
    return mapItem(parseCmsItem(await response.json()));
  }
}

async function fetchWithTimeout(url: string, externalSignal?: AbortSignal, acceptNotFound = false): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 20_000);
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok && !(acceptNotFound && response.status === 404)) throw new Error(`Content API failed with ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abort);
  }
}

function parseCmsItem(value: unknown): CmsItem {
  if (!isRecord(value) || !isContentType(value.type) || !isSpecialty(value.specialty) ||
    typeof value.id !== 'string' || typeof value.title !== 'string' || !Array.isArray(value.tags) ||
    !value.tags.every((tag) => typeof tag === 'string') || typeof value.sourceLabel !== 'string' ||
    typeof value.version !== 'number' || typeof value.updatedAt !== 'string' || !isRecord(value.payload)) {
    throw new Error('Некорректный материал CMS');
  }
  return { id: value.id, type: value.type, specialty: value.specialty, title: value.title, tags: value.tags,
    sourceLabel: value.sourceLabel, version: value.version, updatedAt: value.updatedAt, payload: value.payload };
}

function mapItem(item: CmsItem): LearningContent {
  if (item.type === 'question') return {
    id: item.id, title: item.title, specialty: item.specialty, tags: item.tags,
    shortAnswer: stringField(item.payload, 'shortAnswer'), fullAnswer: stringField(item.payload, 'fullAnswer'),
    difficulty: difficultyField(item.payload), updatedAt: item.updatedAt, sourceLabel: item.sourceLabel,
  };
  if (item.type === 'task') {
    const starterCode = optionalStringField(item.payload, 'starterCode');
    const runner = runnerField(item.payload);
    return {
      id: item.id, contentVersion: item.version, title: item.title, specialty: item.specialty,
      description: stringField(item.payload, 'description'), difficulty: difficultyField(item.payload),
      estimatedMinutes: numberField(item.payload, 'estimatedMinutes'), skills: stringArrayField(item.payload, 'skills'),
      ...(starterCode ? { starterCode } : {}), ...(runner ? { runner } : {}), solution: stringField(item.payload, 'solution'),
    };
  }
  if (item.type === 'video') return {
    id: item.id, contentVersion: item.version, title: item.title, specialty: item.specialty, author: stringField(item.payload, 'author'),
    durationMinutes: numberField(item.payload, 'durationMinutes'), url: httpsField(item.payload, 'url'),
    ...(quizField(item.payload) ? { quiz: quizField(item.payload) } : {}),
  };
  return {
    id: item.id, title: item.title, specialty: item.specialty,
    description: stringField(item.payload, 'description'), lessons: numberField(item.payload, 'lessons'),
    durationMinutes: numberField(item.payload, 'durationMinutes'), progress: 0,
  };
}

function stringField(value: Record<string, unknown>, key: string): string {
  if (typeof value[key] !== 'string') throw new Error(`Поле ${key} должно быть строкой`);
  return value[key];
}
function optionalStringField(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === 'string' ? value[key] : undefined;
}
function numberField(value: Record<string, unknown>, key: string): number {
  if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) throw new Error(`Поле ${key} должно быть числом`);
  return value[key];
}
function stringArrayField(value: Record<string, unknown>, key: string): string[] {
  const field = value[key];
  if (!Array.isArray(field) || !field.every((item) => typeof item === 'string')) throw new Error(`Поле ${key} должно быть массивом`);
  return field;
}
function quizField(value: Record<string, unknown>) {
  if (value.quiz === undefined) return undefined;
  if (!Array.isArray(value.quiz)) throw new Error('Поле quiz должно быть массивом');
  return value.quiz.map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.prompt !== 'string' ||
      !Array.isArray(item.options) || !item.options.every((option) => typeof option === 'string')) {
      throw new Error('Некорректный вопрос теста');
    }
    return { id: item.id, prompt: item.prompt, options: item.options };
  });
}
function runnerField(value: Record<string, unknown>) {
  if (value.runner === undefined) return undefined;
  if (!isRecord(value.runner) || value.runner.language !== 'javascript' || typeof value.runner.entrypoint !== 'string') {
    throw new Error('Некорректная конфигурация runner');
  }
  return { language: 'javascript' as const, entrypoint: value.runner.entrypoint };
}
function difficultyField(value: Record<string, unknown>) {
  const field = value.difficulty;
  if (field !== 'Начальный' && field !== 'Средний' && field !== 'Продвинутый') throw new Error('Некорректная сложность');
  return field;
}
function httpsField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  try {
    const url = new URL(field);
    if (url.protocol !== 'https:') throw new Error();
    return url.toString();
  } catch { throw new Error(`Поле ${key} должно использовать корректный HTTPS URL`); }
}
function isContentType(value: unknown): value is LearningContentType { return value === 'question' || value === 'task' || value === 'video' || value === 'track'; }
function isSpecialty(value: unknown): value is Specialty { return value === 'Frontend' || value === 'Backend' || value === 'Mobile' || value === 'QA'; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }

export const apiLearningRepository = new ApiLearningRepository();
