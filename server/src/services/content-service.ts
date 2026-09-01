import { encodeCursor } from '../cursor.js';
import {
  ContentError, type AdminContentQuery, type ContentInput, type ContentRevision,
  type ContentStatus, type PublicContentRevision, type PublishedContentQuery,
} from '../content-domain.js';
import type { ContentRepository } from '../repositories/content-repository.js';

const allowedTransitions: Record<ContentStatus, ContentStatus[]> = {
  draft: ['review'],
  review: ['draft', 'published'],
  published: ['archived'],
  archived: [],
};

export class ContentService {
  constructor(private readonly repository: ContentRepository) {}

  async create(input: ContentInput): Promise<ContentRevision> {
    return this.repository.create(input);
  }

  async revise(id: string, input: ContentInput, expectedVersion: number): Promise<ContentRevision> {
    const latest = await this.repository.findLatest(id);
    if (!latest) throw new ContentError(404, 'not_found', 'Материал не найден');
    if (latest.type !== input.type) throw new ContentError(409, 'type_conflict', 'Тип материала нельзя изменить');
    const revision = await this.repository.revise(id, input, expectedVersion);
    if (!revision) throw new ContentError(409, 'version_conflict', 'Материал уже изменён другим редактором');
    return revision;
  }

  async transition(id: string, status: ContentStatus, expectedVersion: number): Promise<ContentRevision> {
    const latest = await this.repository.findLatest(id);
    if (!latest) throw new ContentError(404, 'not_found', 'Материал не найден');
    if (latest.version !== expectedVersion) throw new ContentError(409, 'version_conflict', 'Версия материала устарела');
    if (!allowedTransitions[latest.status].includes(status)) {
      throw new ContentError(409, 'invalid_transition', `Переход ${latest.status} → ${status} запрещён`);
    }
    const revision = await this.repository.transition(id, status, expectedVersion);
    if (!revision) throw new ContentError(409, 'version_conflict', 'Материал уже изменён');
    return revision;
  }

  async listPublished(query: PublishedContentQuery) {
    const rows = await this.repository.listPublished(query);
    const hasNext = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map(toPublicRevision),
      nextCursor: hasNext && last?.publishedAt
        ? encodeCursor({ id: last.id, publishedAt: last.publishedAt })
        : null,
      syncedAt: new Date().toISOString(),
    };
  }

  async findPublished(id: string): Promise<PublicContentRevision | null> {
    const item = await this.repository.findPublished(id);
    return item ? toPublicRevision(item) : null;
  }
  async findPublishedRaw(id: string): Promise<ContentRevision | null> { return this.repository.findPublished(id); }
  async listAdmin(query: AdminContentQuery): Promise<ContentRevision[]> { return this.repository.listAdmin(query); }
  async countPublished(): Promise<number> { return this.repository.countPublished(); }
  async close(): Promise<void> { await this.repository.close(); }
}

function toPublicRevision(item: ContentRevision): PublicContentRevision {
  const payload = structuredClone(item.payload) as unknown as Record<string, unknown>;
  if (item.type === 'video' && Array.isArray(payload.quiz)) {
    payload.quiz = payload.quiz.map((value) => {
      const question = value as Record<string, unknown>;
      return { id: question.id, prompt: question.prompt, options: question.options };
    });
  }
  if (item.type === 'task' && payload.runner && typeof payload.runner === 'object') {
    const runner = payload.runner as Record<string, unknown>;
    payload.runner = { language: runner.language, entrypoint: runner.entrypoint };
  }
  const { payload: _privatePayload, ...rest } = item;
  return { ...rest, payload };
}
