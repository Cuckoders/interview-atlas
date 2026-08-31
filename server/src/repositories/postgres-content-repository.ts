import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

import type {
  AdminContentQuery, ContentInput, ContentPayload, ContentRevision, ContentStatus,
  ContentType, PublishedContentQuery,
} from '../content-domain.js';
import type { Specialty } from '../domain.js';
import type { ContentRepository } from './content-repository.js';

type ContentRow = {
  public_id: string; content_type: ContentType; specialty: Specialty; version: string;
  status: ContentStatus; title: string; tags: string[]; source_label: string;
  source_url: string | null; next_review_at: Date; editor: string; payload: ContentPayload;
  published_at: Date | null; created_at: Date; updated_at: Date;
};

export class PostgresContentRepository implements ContentRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  }

  async create(input: ContentInput): Promise<ContentRevision> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const publicId = `${input.type}-${randomUUID()}`;
      const item = await client.query<{ id: string }>(
        'INSERT INTO content_items (public_id, content_type, specialty) VALUES ($1,$2,$3) RETURNING id',
        [publicId, input.type, input.specialty],
      );
      const itemId = item.rows[0]?.id;
      if (!itemId) throw new Error('Content item insert returned no id');
      const row = await insertRevision(client, itemId, 1, input);
      await insertEvent(client, itemId, row.id, 'created', input.editor, { version: 1 });
      await client.query('COMMIT');
      return mapRow(row.value);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async revise(id: string, input: ContentInput, expectedVersion: number): Promise<ContentRevision | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const latest = await lockLatest(client, id);
      if (!latest || Number(latest.version) !== expectedVersion) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query('UPDATE content_items SET specialty = $1 WHERE id = $2', [input.specialty, latest.item_id]);
      const row = await insertRevision(client, latest.item_id, expectedVersion + 1, input);
      await insertEvent(client, latest.item_id, row.id, 'revised', input.editor, { fromVersion: expectedVersion, version: expectedVersion + 1 });
      await client.query('COMMIT');
      return mapRow(row.value);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async transition(id: string, status: ContentStatus, expectedVersion: number): Promise<ContentRevision | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const latest = await lockLatest(client, id);
      if (!latest || Number(latest.version) !== expectedVersion) {
        await client.query('ROLLBACK');
        return null;
      }
      if (status === 'published') {
        await client.query(
          `UPDATE content_revisions SET status='archived', updated_at=now()
           WHERE item_id=$1 AND status='published'`,
          [latest.item_id],
        );
      }
      const result = await client.query<ContentRow>(
        `UPDATE content_revisions SET status=$1, updated_at=now(),
           published_at=CASE WHEN $1='published' THEN now() ELSE published_at END
         WHERE id=$2 RETURNING
           (SELECT public_id FROM content_items WHERE id=item_id) AS public_id,
           (SELECT content_type FROM content_items WHERE id=item_id) AS content_type,
           (SELECT specialty FROM content_items WHERE id=item_id) AS specialty,
           version,status,title,tags,source_label,source_url,next_review_at,editor,payload,
           published_at,created_at,updated_at`,
        [status, latest.revision_id],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Content transition returned no row');
      await insertEvent(client, latest.item_id, latest.revision_id, `status:${status}`, row.editor, { version: expectedVersion });
      await client.query('COMMIT');
      return mapRow(row);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listPublished(query: PublishedContentQuery): Promise<ContentRevision[]> {
    const values: unknown[] = [];
    const where: string[] = ["r.status='published'"];
    const add = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (query.type) where.push(`i.content_type=${add(query.type)}`);
    if (query.specialty) where.push(`i.specialty=${add(query.specialty)}`);
    if (query.cursor) {
      const date = add(query.cursor.publishedAt);
      const id = add(query.cursor.id);
      where.push(`(r.published_at,i.public_id)<(${date},${id})`);
    }
    const limit = add(query.limit + 1);
    const result = await this.pool.query<ContentRow>(
      `${selectContent} WHERE ${where.join(' AND ')}
       ORDER BY r.published_at DESC,i.public_id DESC LIMIT ${limit}`,
      values,
    );
    return result.rows.map(mapRow);
  }

  async findPublished(id: string): Promise<ContentRevision | null> {
    const result = await this.pool.query<ContentRow>(
      `${selectContent} WHERE i.public_id=$1 AND r.status='published'`, [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async listAdmin(query: AdminContentQuery): Promise<ContentRevision[]> {
    const values: unknown[] = [];
    const where: string[] = [];
    const add = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (query.type) where.push(`i.content_type=${add(query.type)}`);
    if (query.specialty) where.push(`i.specialty=${add(query.specialty)}`);
    if (query.status) where.push(`r.status=${add(query.status)}`);
    const limit = add(query.limit);
    const result = await this.pool.query<ContentRow>(
      `SELECT * FROM (
         SELECT DISTINCT ON (i.id)
           i.public_id,i.content_type,i.specialty,r.version,r.status,r.title,r.tags,
           r.source_label,r.source_url,r.next_review_at,r.editor,r.payload,r.published_at,
           r.created_at,r.updated_at
         FROM content_items i JOIN content_revisions r ON r.item_id=i.id
         ORDER BY i.id,r.version DESC
       ) r JOIN content_items i ON i.public_id=r.public_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY r.updated_at DESC,r.public_id DESC LIMIT ${limit}`,
      values,
    );
    return result.rows.map(mapRow);
  }

  async findLatest(id: string): Promise<ContentRevision | null> {
    const result = await this.pool.query<ContentRow>(
      `${selectContent} WHERE i.public_id=$1 ORDER BY r.version DESC LIMIT 1`, [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async countPublished(): Promise<number> {
    const result = await this.pool.query<{ count: string }>("SELECT count(*)::text AS count FROM content_revisions WHERE status='published'");
    return Number(result.rows[0]?.count ?? 0);
  }

  async close(): Promise<void> { await this.pool.end(); }
}

const selectContent = `SELECT i.public_id,i.content_type,i.specialty,r.version,r.status,r.title,r.tags,
  r.source_label,r.source_url,r.next_review_at,r.editor,r.payload,r.published_at,r.created_at,r.updated_at
  FROM content_items i JOIN content_revisions r ON r.item_id=i.id`;

type LockedRevision = { item_id: string; revision_id: string; version: string };
async function lockLatest(client: PoolClient, publicId: string): Promise<LockedRevision | null> {
  const result = await client.query<LockedRevision>(
    `SELECT i.id AS item_id,r.id AS revision_id,r.version
     FROM content_items i JOIN content_revisions r ON r.item_id=i.id
     WHERE i.public_id=$1 ORDER BY r.version DESC LIMIT 1 FOR UPDATE OF r`, [publicId],
  );
  return result.rows[0] ?? null;
}

async function insertRevision(client: PoolClient, itemId: string, version: number, input: ContentInput) {
  const result = await client.query<ContentRow & { id: string }>(
    `INSERT INTO content_revisions
      (item_id,version,status,title,tags,source_label,source_url,next_review_at,editor,payload)
     VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9)
     RETURNING id,
       (SELECT public_id FROM content_items WHERE id=item_id) AS public_id,
       (SELECT content_type FROM content_items WHERE id=item_id) AS content_type,
       (SELECT specialty FROM content_items WHERE id=item_id) AS specialty,
       version,status,title,tags,source_label,source_url,next_review_at,editor,payload,
       published_at,created_at,updated_at`,
    [itemId, version, input.title, input.tags, input.sourceLabel, input.sourceUrl ?? null,
      input.nextReviewAt, input.editor, JSON.stringify(input.payload)],
  );
  const value = result.rows[0];
  if (!value) throw new Error('Content revision insert returned no row');
  return { id: value.id, value };
}

async function insertEvent(
  client: PoolClient, itemId: string, revisionId: string, event: string, actor: string, metadata: unknown,
) {
  await client.query(
    'INSERT INTO content_events (item_id,revision_id,event_type,actor,metadata) VALUES ($1,$2,$3,$4,$5)',
    [itemId, revisionId, event, actor, JSON.stringify(metadata)],
  );
}

function mapRow(row: ContentRow): ContentRevision {
  const item: ContentRevision = {
    id: row.public_id, type: row.content_type, specialty: row.specialty,
    version: Number(row.version), status: row.status, title: row.title, tags: row.tags,
    sourceLabel: row.source_label, nextReviewAt: row.next_review_at.toISOString(),
    editor: row.editor, payload: row.payload, publishedAt: row.published_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
  if (row.source_url) item.sourceUrl = row.source_url;
  return item;
}
