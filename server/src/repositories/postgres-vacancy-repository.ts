import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

import type { Specialty, Vacancy, VacancySearch, WorkFormat } from '../domain.js';
import type { VacancyRepository } from './vacancy-repository.js';

type VacancyRow = {
  public_id: string; external_id: string; title: string; company: string; location: string;
  work_format: WorkFormat; salary: string | null; level: string; specialty: Specialty;
  skills: string[]; description: string; source_name: string; canonical_url: string;
  published_at: Date; collected_at: Date; raw_payload: unknown;
};

export class PostgresVacancyRepository implements VacancyRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  }

  async upsertMany(items: Vacancy[]): Promise<void> {
    if (items.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) await this.upsertOne(client, item);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async upsertOne(client: PoolClient, item: Vacancy): Promise<void> {
    const source = await client.query<{ id: number }>(
      `INSERT INTO vacancy_sources (name, base_url) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET updated_at = now() RETURNING id`,
      [item.source, new URL(item.sourceUrl).origin],
    );
    const sourceId = source.rows[0]?.id;
    if (!sourceId) throw new Error('Source upsert returned no id');

    const vacancy = await client.query<{ id: string }>(
      `INSERT INTO vacancies
       (public_id, source_id, external_id, canonical_url, title, company, location, work_format,
        salary, level, specialty, skills, description, published_at, collected_at, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (source_id, external_id) DO UPDATE SET
         canonical_url=excluded.canonical_url, title=excluded.title, company=excluded.company,
         location=excluded.location, work_format=excluded.work_format, salary=excluded.salary,
         level=excluded.level, specialty=excluded.specialty, skills=excluded.skills,
         description=excluded.description, published_at=excluded.published_at,
         collected_at=excluded.collected_at, raw_payload=excluded.raw_payload, updated_at=now()
       RETURNING id`,
      [item.id, sourceId, item.externalId, item.sourceUrl, item.title, item.company, item.location,
        item.workFormat, item.salary ?? null, item.level, item.specialty, item.skills,
        item.description, item.publishedAt, item.collectedAt, JSON.stringify(item.rawPayload)],
    );
    const vacancyId = vacancy.rows[0]?.id;
    if (!vacancyId) throw new Error('Vacancy upsert returned no id');
    const payload = JSON.stringify(item.rawPayload);
    const hash = createHash('sha256').update(payload).digest('hex');
    await client.query(
      `INSERT INTO vacancy_snapshots (vacancy_id, payload_hash, payload, fetched_at)
       VALUES ($1,$2,$3,$4) ON CONFLICT (vacancy_id, payload_hash) DO NOTHING`,
      [vacancyId, hash, payload, item.collectedAt],
    );
  }

  async search(query: VacancySearch): Promise<Vacancy[]> {
    const values: unknown[] = [];
    const where: string[] = ['v.archived_at IS NULL'];
    const add = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (query.specialty) where.push(`v.specialty = ${add(query.specialty)}`);
    if (query.workFormat) where.push(`v.work_format = ${add(query.workFormat)}`);
    if (query.query) {
      const value = add(`%${query.query.trim()}%`);
      where.push(`(v.title ILIKE ${value} OR v.company ILIKE ${value} OR v.location ILIKE ${value} OR array_to_string(v.skills, ' ') ILIKE ${value})`);
    }
    if (query.cursor) {
      const publishedAt = add(query.cursor.publishedAt);
      const publicId = add(query.cursor.id);
      where.push(`(v.published_at, v.public_id) < (${publishedAt}, ${publicId})`);
    }
    const limit = add(query.limit + 1);
    const result = await this.pool.query<VacancyRow>(
      `SELECT v.public_id, v.external_id, v.title, v.company, v.location, v.work_format,
              v.salary, v.level, v.specialty, v.skills, v.description, s.name AS source_name,
              v.canonical_url, v.published_at, v.collected_at, v.raw_payload
       FROM vacancies v JOIN vacancy_sources s ON s.id = v.source_id
       WHERE ${where.join(' AND ')}
       ORDER BY v.published_at DESC, v.public_id DESC LIMIT ${limit}`,
      values,
    );
    return result.rows.map(mapRow);
  }

  async findById(id: string): Promise<Vacancy | null> {
    const result = await this.pool.query<VacancyRow>(
      `SELECT v.public_id, v.external_id, v.title, v.company, v.location, v.work_format,
              v.salary, v.level, v.specialty, v.skills, v.description, s.name AS source_name,
              v.canonical_url, v.published_at, v.collected_at, v.raw_payload
       FROM vacancies v JOIN vacancy_sources s ON s.id = v.source_id
       WHERE v.public_id = $1 AND v.archived_at IS NULL`, [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async count(): Promise<number> {
    const result = await this.pool.query<{ count: string }>('SELECT count(*)::text AS count FROM vacancies WHERE archived_at IS NULL');
    return Number(result.rows[0]?.count ?? 0);
  }

  async close(): Promise<void> { await this.pool.end(); }
}

function mapRow(row: VacancyRow): Vacancy {
  const item: Vacancy = {
    id: row.public_id, externalId: row.external_id, title: row.title, company: row.company,
    location: row.location, workFormat: row.work_format, level: row.level,
    specialty: row.specialty, skills: row.skills, description: row.description,
    source: row.source_name, sourceUrl: row.canonical_url,
    publishedAt: row.published_at.toISOString(), collectedAt: row.collected_at.toISOString(),
    rawPayload: row.raw_payload,
  };
  if (row.salary) item.salary = row.salary;
  return item;
}
