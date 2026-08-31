import type {
  AdminContentQuery, ContentInput, ContentRevision, ContentStatus, PublishedContentQuery,
} from '../content-domain.js';

export interface ContentRepository {
  create(input: ContentInput): Promise<ContentRevision>;
  revise(id: string, input: ContentInput, expectedVersion: number): Promise<ContentRevision | null>;
  transition(id: string, status: ContentStatus, expectedVersion: number): Promise<ContentRevision | null>;
  listPublished(query: PublishedContentQuery): Promise<ContentRevision[]>;
  findPublished(id: string): Promise<ContentRevision | null>;
  listAdmin(query: AdminContentQuery): Promise<ContentRevision[]>;
  findLatest(id: string): Promise<ContentRevision | null>;
  countPublished(): Promise<number>;
  close(): Promise<void>;
}
