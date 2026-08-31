import { Pool, type PoolClient } from 'pg';

import {
  applyProgressAction,
  type Account,
  type AccountCredentials,
  type CloudProgress,
  type ProgressAction,
} from '../account-domain.js';
import type { Specialty } from '../domain.js';
import type { AccountRepository, NewAccount, NewSession, RotatedSession } from './account-repository.js';

type AccountRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  created_at: Date;
};

type ProgressRow = {
  version: string;
  specialty: Specialty;
  saved_question_ids: string[];
  saved_vacancy_ids: string[];
  completed_task_ids: string[];
  updated_at: Date;
};

export class PostgresAccountRepository implements AccountRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  async createAccount(input: NewAccount): Promise<Account | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<AccountRow>(
        `INSERT INTO app_users (id,email,display_name,password_hash)
         VALUES ($1,$2,$3,$4)
         RETURNING id,email,display_name,password_hash,created_at`,
        [input.id, input.email, input.displayName, input.passwordHash],
      );
      await client.query('INSERT INTO user_sync_state (user_id) VALUES ($1)', [input.id]);
      await client.query('COMMIT');
      const row = result.rows[0];
      return row ? mapAccount(row) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error)) return null;
      throw error;
    } finally {
      client.release();
    }
  }

  async findCredentialsByEmail(email: string): Promise<AccountCredentials | null> {
    const result = await this.pool.query<AccountRow>(
      'SELECT id,email,display_name,password_hash,created_at FROM app_users WHERE email=$1',
      [email],
    );
    return result.rows[0] ? mapCredentials(result.rows[0]) : null;
  }

  async findCredentialsById(id: string): Promise<AccountCredentials | null> {
    const result = await this.pool.query<AccountRow>(
      'SELECT id,email,display_name,password_hash,created_at FROM app_users WHERE id=$1',
      [id],
    );
    return result.rows[0] ? mapCredentials(result.rows[0]) : null;
  }

  async createSession(input: NewSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_sessions
       (id,user_id,access_token_hash,refresh_token_hash,access_expires_at,refresh_expires_at,device_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.id, input.userId, input.accessHash, input.refreshHash, input.accessExpiresAt, input.refreshExpiresAt, input.deviceName],
    );
  }

  async findAccountByAccessHash(accessHash: string): Promise<Account | null> {
    const result = await this.pool.query<AccountRow>(
      `SELECT u.id,u.email,u.display_name,u.password_hash,u.created_at
       FROM user_sessions s JOIN app_users u ON u.id=s.user_id
       WHERE s.access_token_hash=$1 AND s.revoked_at IS NULL AND s.access_expires_at>now()`,
      [accessHash],
    );
    return result.rows[0] ? mapAccount(result.rows[0]) : null;
  }

  async rotateSession(refreshHash: string, next: RotatedSession): Promise<Account | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const session = await client.query<{ id: string; user_id: string }>(
        `SELECT id,user_id FROM user_sessions
         WHERE refresh_token_hash=$1 AND revoked_at IS NULL AND refresh_expires_at>now()
         FOR UPDATE`,
        [refreshHash],
      );
      const current = session.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query(
        `UPDATE user_sessions SET access_token_hash=$1,refresh_token_hash=$2,
         access_expires_at=$3,refresh_expires_at=$4,last_used_at=now() WHERE id=$5`,
        [next.accessHash, next.refreshHash, next.accessExpiresAt, next.refreshExpiresAt, current.id],
      );
      const account = await client.query<AccountRow>(
        'SELECT id,email,display_name,password_hash,created_at FROM app_users WHERE id=$1',
        [current.user_id],
      );
      await client.query('COMMIT');
      return account.rows[0] ? mapAccount(account.rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeSession(accessHash: string): Promise<void> {
    await this.pool.query(
      'UPDATE user_sessions SET revoked_at=now() WHERE access_token_hash=$1 AND revoked_at IS NULL',
      [accessHash],
    );
  }

  async getProgress(userId: string): Promise<CloudProgress> {
    const result = await this.pool.query<ProgressRow>(
      `SELECT version,specialty,saved_question_ids,saved_vacancy_ids,completed_task_ids,updated_at
       FROM user_sync_state WHERE user_id=$1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Sync state not found');
    return mapProgress(row);
  }

  async applyActions(userId: string, actions: ProgressAction[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<ProgressRow>(
        `SELECT version,specialty,saved_question_ids,saved_vacancy_ids,completed_task_ids,updated_at
         FROM user_sync_state WHERE user_id=$1 FOR UPDATE`,
        [userId],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Sync state not found');
      const state = mapProgress(row);
      const acknowledgedIds: string[] = [];
      let applied = 0;
      for (const action of actions) {
        acknowledgedIds.push(action.id);
        const inserted = await insertAction(client, userId, action);
        if (!inserted) continue;
        applyProgressAction(state, action);
        applied += 1;
      }
      if (applied > 0) {
        state.version += applied;
        const updated = await client.query<ProgressRow>(
          `UPDATE user_sync_state SET version=$2,specialty=$3,saved_question_ids=$4,
           saved_vacancy_ids=$5,completed_task_ids=$6,updated_at=now()
           WHERE user_id=$1
           RETURNING version,specialty,saved_question_ids,saved_vacancy_ids,completed_task_ids,updated_at`,
          [userId, state.version, state.specialty, state.savedQuestionIds, state.savedVacancyIds, state.completedTaskIds],
        );
        if (updated.rows[0]) Object.assign(state, mapProgress(updated.rows[0]));
      }
      await client.query('COMMIT');
      return { progress: state, acknowledgedIds };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteAccount(userId: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM app_users WHERE id=$1', [userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async close(): Promise<void> { await this.pool.end(); }
}
async function insertAction(client: PoolClient, userId: string, action: ProgressAction): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO user_sync_actions (user_id,action_id,action_type,target_id,value,occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id,action_id) DO NOTHING`,
    [userId, action.id, action.type, action.targetId ?? null, JSON.stringify(action.value), action.occurredAt],
  );
  return (result.rowCount ?? 0) > 0;
}

function mapAccount(row: AccountRow): Account {
  return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at.toISOString() };
}

function mapCredentials(row: AccountRow): AccountCredentials {
  return { ...mapAccount(row), passwordHash: row.password_hash };
}

function mapProgress(row: ProgressRow): CloudProgress {
  return {
    version: Number(row.version),
    specialty: row.specialty,
    savedQuestionIds: row.saved_question_ids,
    savedVacancyIds: row.saved_vacancy_ids,
    completedTaskIds: row.completed_task_ids,
    updatedAt: row.updated_at.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
