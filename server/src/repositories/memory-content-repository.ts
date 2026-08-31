import { randomUUID } from 'node:crypto';

import type {
  AdminContentQuery, ContentInput, ContentRevision, ContentStatus, PublishedContentQuery,
} from '../content-domain.js';
import type { ContentRepository } from './content-repository.js';

export class MemoryContentRepository implements ContentRepository {
  private readonly revisions = new Map<string, ContentRevision[]>();

  async create(input: ContentInput): Promise<ContentRevision> {
    const id = `${input.type}-${randomUUID()}`;
    const revision = makeRevision(id, 1, input);
    this.revisions.set(id, [revision]);
    return revision;
  }

  async revise(id: string, input: ContentInput, expectedVersion: number): Promise<ContentRevision | null> {
    const revisions = this.revisions.get(id);
    const latest = revisions?.at(-1);
    if (!revisions || !latest) return null;
    if (latest.version !== expectedVersion) return null;
    const revision = makeRevision(id, latest.version + 1, input);
    revisions.push(revision);
    return revision;
  }

  async transition(id: string, status: ContentStatus, expectedVersion: number): Promise<ContentRevision | null> {
    const revisions = this.revisions.get(id);
    const latest = revisions?.at(-1);
    if (!revisions || !latest || latest.version !== expectedVersion) return null;
    const now = new Date().toISOString();
    if (status === 'published') {
      for (const revision of revisions) {
        if (revision.status === 'published') {
          revision.status = 'archived';
          revision.updatedAt = now;
        }
      }
      latest.publishedAt = now;
    }
    latest.status = status;
    latest.updatedAt = now;
    return structuredClone(latest);
  }

  async listPublished(query: PublishedContentQuery): Promise<ContentRevision[]> {
    return [...this.revisions.values()]
      .map((items) => [...items].reverse().find((item) => item.status === 'published'))
      .filter((item): item is ContentRevision => Boolean(item))
      .filter((item) => !query.type || item.type === query.type)
      .filter((item) => !query.specialty || item.specialty === query.specialty)
      .filter((item) => !query.cursor || compareCursor(item, query.cursor) < 0)
      .sort(sortPublished)
      .slice(0, query.limit + 1)
      .map((item) => structuredClone(item));
  }

  async findPublished(id: string): Promise<ContentRevision | null> {
    const item = [...(this.revisions.get(id) ?? [])].reverse().find((revision) => revision.status === 'published');
    return item ? structuredClone(item) : null;
  }

  async listAdmin(query: AdminContentQuery): Promise<ContentRevision[]> {
    return [...this.revisions.values()]
      .map((items) => items.at(-1))
      .filter((item): item is ContentRevision => Boolean(item))
      .filter((item) => !query.type || item.type === query.type)
      .filter((item) => !query.specialty || item.specialty === query.specialty)
      .filter((item) => !query.status || item.status === query.status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      .slice(0, query.limit)
      .map((item) => structuredClone(item));
  }

  async findLatest(id: string): Promise<ContentRevision | null> {
    const item = this.revisions.get(id)?.at(-1);
    return item ? structuredClone(item) : null;
  }

  async countPublished(): Promise<number> {
    return (await this.listPublished({ limit: Number.MAX_SAFE_INTEGER })).length;
  }

  async close(): Promise<void> {}
}

function makeRevision(id: string, version: number, input: ContentInput): ContentRevision {
  const now = new Date().toISOString();
  return { ...structuredClone(input), id, version, status: 'draft', createdAt: now, updatedAt: now, publishedAt: null };
}

function sortPublished(a: ContentRevision, b: ContentRevision): number {
  return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || b.id.localeCompare(a.id);
}

function compareCursor(item: ContentRevision, cursor: NonNullable<PublishedContentQuery['cursor']>): number {
  return (item.publishedAt ?? '').localeCompare(cursor.publishedAt) || item.id.localeCompare(cursor.id);
}
