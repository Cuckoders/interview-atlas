import { Pool, type PoolClient } from 'pg';

import type {
  CompletionAction,
  PreparationProfile,
  PreparationSession,
  SkillMastery,
  WeeklyPlan,
} from '../preparation-domain.js';
import { skillCatalog } from '../preparation-domain.js';
import { applyReview } from './memory-preparation-repository.js';
import type { PreparationRepository, ProfileInput } from './preparation-repository.js';

type ProfileRow = {
  specialty: PreparationProfile['specialty']; level: PreparationProfile['level']; target_date: string;
  target_companies: string[]; sessions_per_week: number; session_minutes: number; reminders_enabled: boolean;
  reminder_hour: number; reminder_minute: number; quiet_start_minute: number; quiet_end_minute: number;
  timezone: string; diagnostic_completed_at: Date | null; updated_at: Date;
};
type SkillRow = {
  skill_key: string; skill_label: string; score: number; repetition_count: number;
  interval_days: number; next_review_at: string; updated_at: Date;
};
type PlanRow = {
  revision: number; period_start: string; period_end: string; generated_at: Date;
  reason: WeeklyPlan['reason']; sessions: PreparationSession[];
};

export class PostgresPreparationRepository implements PreparationRepository {
  private readonly pool: Pool;
  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  }

  async getProfile(userId: string) {
    const result = await this.pool.query<ProfileRow>(`${profileSelect} WHERE user_id=$1`, [userId]);
    return result.rows[0] ? mapProfile(result.rows[0]) : null;
  }

  async saveProfile(userId: string, input: ProfileInput) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<ProfileRow>(
        `INSERT INTO preparation_profiles
         (user_id,specialty,level,target_date,target_companies,sessions_per_week,session_minutes,reminders_enabled,
          reminder_hour,reminder_minute,quiet_start_minute,quiet_end_minute,timezone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (user_id) DO UPDATE SET specialty=EXCLUDED.specialty,level=EXCLUDED.level,
         target_date=EXCLUDED.target_date,target_companies=EXCLUDED.target_companies,
         sessions_per_week=EXCLUDED.sessions_per_week,session_minutes=EXCLUDED.session_minutes,
         reminders_enabled=EXCLUDED.reminders_enabled,reminder_hour=EXCLUDED.reminder_hour,
         reminder_minute=EXCLUDED.reminder_minute,quiet_start_minute=EXCLUDED.quiet_start_minute,
         quiet_end_minute=EXCLUDED.quiet_end_minute,timezone=EXCLUDED.timezone,
         diagnostic_completed_at=CASE WHEN preparation_profiles.specialty=EXCLUDED.specialty
           THEN preparation_profiles.diagnostic_completed_at ELSE NULL END,updated_at=now()
         RETURNING specialty,level,target_date::text,target_companies,sessions_per_week,session_minutes,reminders_enabled,
         reminder_hour,reminder_minute,quiet_start_minute,quiet_end_minute,timezone,diagnostic_completed_at,updated_at`,
        [userId, input.specialty, input.level, input.targetDate, input.targetCompanies, input.sessionsPerWeek,
          input.sessionMinutes, input.remindersEnabled, input.reminderHour, input.reminderMinute,
          input.quietStartMinute, input.quietEndMinute, input.timezone],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Preparation profile was not saved');
      if (row.diagnostic_completed_at) {
        await client.query('DELETE FROM user_skill_mastery WHERE user_id=$1 AND skill_key<>ALL($2::text[])', [
          userId, skillCatalog[input.specialty].map((skill) => skill.key),
        ]);
      } else await client.query('DELETE FROM user_skill_mastery WHERE user_id=$1', [userId]);
      await client.query('COMMIT');
      return mapProfile(row);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async getSkills(userId: string) {
    const result = await this.pool.query<SkillRow>(
      `SELECT skill_key,skill_label,score,repetition_count,interval_days,next_review_at::text,updated_at
       FROM user_skill_mastery WHERE user_id=$1 ORDER BY score,skill_key`, [userId],
    );
    return result.rows.map(mapSkill);
  }

  async saveDiagnostic(userId: string, specialty: PreparationProfile['specialty'], ratings: Record<string, number>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const { key, label } of skillCatalog[specialty]) {
        await client.query(
          `INSERT INTO user_skill_mastery (user_id,skill_key,skill_label,score,next_review_at)
           VALUES ($1,$2,$3,$4,CURRENT_DATE)
           ON CONFLICT (user_id,skill_key) DO UPDATE SET skill_label=EXCLUDED.skill_label,score=EXCLUDED.score,
           repetition_count=0,interval_days=0,next_review_at=CURRENT_DATE,updated_at=now()`,
          [userId, key, label, (ratings[key] ?? 1) * 20],
        );
      }
      await client.query('UPDATE preparation_profiles SET diagnostic_completed_at=now(),updated_at=now() WHERE user_id=$1', [userId]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return this.getSkills(userId);
  }

  async getPlan(userId: string) {
    const result = await this.pool.query<PlanRow>(
      `SELECT revision,period_start::text,period_end::text,generated_at,reason,sessions
       FROM current_preparation_plans WHERE user_id=$1`, [userId],
    );
    return result.rows[0] ? mapPlan(result.rows[0]) : null;
  }

  async savePlan(userId: string, plan: WeeklyPlan) {
    const result = await this.pool.query<PlanRow>(
      `INSERT INTO current_preparation_plans (user_id,revision,period_start,period_end,generated_at,reason,sessions)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET revision=EXCLUDED.revision,period_start=EXCLUDED.period_start,
       period_end=EXCLUDED.period_end,generated_at=EXCLUDED.generated_at,reason=EXCLUDED.reason,sessions=EXCLUDED.sessions
       RETURNING revision,period_start::text,period_end::text,generated_at,reason,sessions`,
      [userId, plan.revision, plan.periodStart, plan.periodEnd, plan.generatedAt, plan.reason, JSON.stringify(plan.sessions)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Preparation plan was not saved');
    return mapPlan(row);
  }

  async applyCompletion(userId: string, action: CompletionAction): Promise<'applied' | 'duplicate' | 'not_found'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO preparation_actions (user_id,action_id,session_id,quality,occurred_at)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id,action_id) DO NOTHING`,
        [userId, action.actionId, action.sessionId, action.quality, action.occurredAt],
      );
      if ((inserted.rowCount ?? 0) === 0) { await client.query('COMMIT'); return 'duplicate'; }
      const planResult = await client.query<PlanRow>(
        `SELECT revision,period_start::text,period_end::text,generated_at,reason,sessions
         FROM current_preparation_plans WHERE user_id=$1 FOR UPDATE`, [userId],
      );
      const row = planResult.rows[0];
      const plan = row ? mapPlan(row) : null;
      const session = plan?.sessions.find((item) => item.id === action.sessionId);
      if (!plan || !session) { await client.query('ROLLBACK'); return 'not_found'; }
      if (session.status !== 'completed') {
        session.status = 'completed'; session.completedAt = action.occurredAt; session.quality = action.quality;
        await updateMastery(client, userId, session.skillKey, session.skillLabel, action);
        await client.query('UPDATE current_preparation_plans SET sessions=$2::jsonb WHERE user_id=$1', [userId, JSON.stringify(plan.sessions)]);
      } else { await client.query('COMMIT'); return 'duplicate'; }
      await client.query('COMMIT');
      return 'applied';
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async close() { await this.pool.end(); }
}

async function updateMastery(client: PoolClient, userId: string, skillKey: string, skillLabel: string, action: CompletionAction): Promise<void> {
  const result = await client.query<SkillRow>(
    `SELECT skill_key,skill_label,score,repetition_count,interval_days,next_review_at::text,updated_at
     FROM user_skill_mastery WHERE user_id=$1 AND skill_key=$2 FOR UPDATE`, [userId, skillKey],
  );
  const row = result.rows[0];
  const skill = row ? mapSkill(row) : {
    key: skillKey, label: skillLabel, score: 40, repetitionCount: 0, intervalDays: 0,
    nextReviewAt: action.occurredAt.slice(0, 10), updatedAt: action.occurredAt,
  };
  applyReview(skill, action.quality, action.occurredAt);
  await client.query(
    `INSERT INTO user_skill_mastery
     (user_id,skill_key,skill_label,score,repetition_count,interval_days,next_review_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id,skill_key) DO UPDATE SET skill_label=EXCLUDED.skill_label,score=EXCLUDED.score,repetition_count=EXCLUDED.repetition_count,
     interval_days=EXCLUDED.interval_days,next_review_at=EXCLUDED.next_review_at,updated_at=EXCLUDED.updated_at`,
    [userId, skillKey, skill.label, skill.score, skill.repetitionCount, skill.intervalDays, skill.nextReviewAt, skill.updatedAt],
  );
}

const profileSelect = `SELECT specialty,level,target_date::text,target_companies,sessions_per_week,session_minutes,
  reminders_enabled,reminder_hour,reminder_minute,quiet_start_minute,quiet_end_minute,timezone,
  diagnostic_completed_at,updated_at FROM preparation_profiles`;

function mapProfile(row: ProfileRow): PreparationProfile {
  return { specialty: row.specialty, level: row.level, targetDate: row.target_date,
    targetCompanies: row.target_companies, sessionsPerWeek: row.sessions_per_week, sessionMinutes: row.session_minutes,
    remindersEnabled: row.reminders_enabled, reminderHour: row.reminder_hour, reminderMinute: row.reminder_minute,
    quietStartMinute: row.quiet_start_minute, quietEndMinute: row.quiet_end_minute, timezone: row.timezone,
    diagnosticCompletedAt: row.diagnostic_completed_at?.toISOString() ?? null, updatedAt: row.updated_at.toISOString() };
}
function mapSkill(row: SkillRow): SkillMastery {
  return { key: row.skill_key, label: row.skill_label, score: row.score, repetitionCount: row.repetition_count,
    intervalDays: row.interval_days, nextReviewAt: row.next_review_at, updatedAt: row.updated_at.toISOString() };
}
function mapPlan(row: PlanRow): WeeklyPlan {
  return { revision: row.revision, periodStart: row.period_start, periodEnd: row.period_end,
    generatedAt: row.generated_at.toISOString(), reason: row.reason, sessions: row.sessions };
}
