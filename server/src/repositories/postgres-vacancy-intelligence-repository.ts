import { Pool } from 'pg';

import type { PublicVacancy, Specialty, WorkFormat } from '../domain.js';
import type {
  AlertIntervalHours,
  SavedVacancySearch,
  SavedVacancySearchInput,
  VacancyPreparationPlan,
} from '../vacancy-intelligence-domain.js';
import type { VacancyBaseline, VacancyIntelligenceRepository } from './vacancy-intelligence-repository.js';

type SearchRow = {
  id: string; name: string; query: string | null; specialty: Specialty | null; work_format: WorkFormat | null;
  notifications_enabled: boolean; interval_hours: AlertIntervalHours; last_checked_at: Date | null;
  created_at: Date; updated_at: Date;
};
type BaselineRow = { snapshot: PublicVacancy; fingerprint: string; updated_at: Date };
type PlanRow = { plan: VacancyPreparationPlan };

export class PostgresVacancyIntelligenceRepository implements VacancyIntelligenceRepository {
  private readonly pool: Pool;
  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  }

  async listSearches(userId: string) {
    const result = await this.pool.query<SearchRow>(`${searchSelect} WHERE user_id=$1 ORDER BY updated_at DESC`, [userId]);
    return result.rows.map(mapSearch);
  }

  async createSearch(userId: string, id: string, input: SavedVacancySearchInput) {
    const result = await this.pool.query<SearchRow>(
      `INSERT INTO saved_vacancy_searches
       (id,user_id,name,query,specialty,work_format,notifications_enabled,interval_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,name,query,specialty,work_format,notifications_enabled,interval_hours,last_checked_at,created_at,updated_at`,
      [id, userId, input.name, input.query ?? null, input.specialty ?? null, input.workFormat ?? null,
        input.notificationsEnabled, input.intervalHours],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Saved search was not created');
    return mapSearch(row);
  }

  async updateSearch(userId: string, id: string, input: SavedVacancySearchInput) {
    const result = await this.pool.query<SearchRow>(
      `UPDATE saved_vacancy_searches SET name=$3,query=$4,specialty=$5,work_format=$6,
       notifications_enabled=$7,interval_hours=$8,updated_at=now() WHERE user_id=$1 AND id=$2
       RETURNING id,name,query,specialty,work_format,notifications_enabled,interval_hours,last_checked_at,created_at,updated_at`,
      [userId, id, input.name, input.query ?? null, input.specialty ?? null, input.workFormat ?? null,
        input.notificationsEnabled, input.intervalHours],
    );
    return result.rows[0] ? mapSearch(result.rows[0]) : null;
  }

  async deleteSearch(userId: string, id: string) {
    const result = await this.pool.query('DELETE FROM saved_vacancy_searches WHERE user_id=$1 AND id=$2', [userId, id]);
    return (result.rowCount ?? 0) > 0;
  }

  async claimNotifications(userId: string, searchId: string, vacancyIds: string[], checkedAt: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const claimed: string[] = [];
      for (const vacancyId of vacancyIds) {
        const result = await client.query<{ vacancy_id: string }>(
          `INSERT INTO vacancy_alert_deliveries (user_id,search_id,vacancy_id,claimed_at)
           SELECT $1,$2,$3,$4 WHERE EXISTS (
             SELECT 1 FROM saved_vacancy_searches WHERE user_id=$1 AND id=$2
           ) ON CONFLICT (user_id,search_id,vacancy_id) DO NOTHING RETURNING vacancy_id`,
          [userId, searchId, vacancyId, checkedAt],
        );
        const row = result.rows[0];
        if (row) claimed.push(row.vacancy_id);
      }
      await client.query(
        'UPDATE saved_vacancy_searches SET last_checked_at=$3 WHERE user_id=$1 AND id=$2',
        [userId, searchId, checkedAt],
      );
      await client.query('COMMIT');
      return claimed;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async getBaseline(userId: string, vacancyId: string) {
    const result = await this.pool.query<BaselineRow>(
      'SELECT snapshot,fingerprint,updated_at FROM saved_vacancy_baselines WHERE user_id=$1 AND vacancy_id=$2',
      [userId, vacancyId],
    );
    return result.rows[0] ? mapBaseline(result.rows[0]) : null;
  }

  async saveBaseline(userId: string, vacancyId: string, vacancy: PublicVacancy, fingerprint: string) {
    const result = await this.pool.query<BaselineRow>(
      `INSERT INTO saved_vacancy_baselines (user_id,vacancy_id,snapshot,fingerprint)
       VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT (user_id,vacancy_id) DO UPDATE SET
       snapshot=EXCLUDED.snapshot,fingerprint=EXCLUDED.fingerprint,updated_at=now()
       RETURNING snapshot,fingerprint,updated_at`,
      [userId, vacancyId, JSON.stringify(vacancy), fingerprint],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Vacancy baseline was not saved');
    return mapBaseline(row);
  }

  async getPlan(userId: string, vacancyId: string) {
    const result = await this.pool.query<PlanRow>(
      'SELECT plan FROM vacancy_preparation_plans WHERE user_id=$1 AND vacancy_id=$2', [userId, vacancyId],
    );
    return result.rows[0]?.plan ?? null;
  }
  async savePlan(userId: string, plan: VacancyPreparationPlan) {
    const result = await this.pool.query<PlanRow>(
      `INSERT INTO vacancy_preparation_plans (user_id,vacancy_id,plan) VALUES ($1,$2,$3::jsonb)
       ON CONFLICT (user_id,vacancy_id) DO UPDATE SET plan=EXCLUDED.plan,updated_at=now() RETURNING plan`,
      [userId, plan.vacancyId, JSON.stringify(plan)],
    );
    const value = result.rows[0]?.plan;
    if (!value) throw new Error('Vacancy preparation plan was not saved');
    return value;
  }
  async listPlans(userId: string) {
    const result = await this.pool.query<PlanRow>(
      'SELECT plan FROM vacancy_preparation_plans WHERE user_id=$1 ORDER BY updated_at DESC', [userId],
    );
    return result.rows.map((row) => row.plan);
  }
  async close() { await this.pool.end(); }
}

const searchSelect = `SELECT id,name,query,specialty,work_format,notifications_enabled,interval_hours,
  last_checked_at,created_at,updated_at FROM saved_vacancy_searches`;
function mapSearch(row: SearchRow): SavedVacancySearch {
  return {
    id: row.id, name: row.name, ...(row.query ? { query: row.query } : {}),
    ...(row.specialty ? { specialty: row.specialty } : {}), ...(row.work_format ? { workFormat: row.work_format } : {}),
    notificationsEnabled: row.notifications_enabled, intervalHours: row.interval_hours,
    lastCheckedAt: row.last_checked_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}
function mapBaseline(row: BaselineRow): VacancyBaseline {
  return { vacancy: row.snapshot, fingerprint: row.fingerprint, updatedAt: row.updated_at.toISOString() };
}
