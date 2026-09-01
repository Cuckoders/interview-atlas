import { Pool } from 'pg';

import {
  analyzeSimulation, type InterviewSimulation, type QuizAttempt, type SimulationAnswer, type SimulationResult,
  type TaskSubmission, type VideoProgress,
} from '../learning-lab-domain.js';
import type { LearningLabRepository } from './learning-lab-repository.js';

type ProgressRow = { video_id: string; content_version: number; position_seconds: number; duration_seconds: number; completed: boolean; best_quiz_score: number | null; updated_at: Date };
type QuizAttemptRow = { id: string; video_id: string; content_version: number; score: number; correct_count: number; total_count: number; created_at: Date };
type SubmissionRow = { id: string; task_id: string; content_version: number; language: 'javascript'; code: string; passed_count: number; total_count: number; duration_ms: number; result: { tests: TaskSubmission['tests'] }; created_at: Date };
type SimulationRow = { id: string; specialty: InterviewSimulation['specialty']; duration_seconds: number; status: InterviewSimulation['status']; prompts: InterviewSimulation['prompts']; answers: InterviewSimulation['answers']; result: SimulationResult | null; started_at: Date; ends_at: Date; finished_at: Date | null; updated_at: Date };

export class PostgresLearningLabRepository implements LearningLabRepository {
  private readonly pool: Pool;
  constructor(databaseUrl: string) { this.pool = new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 }); }

  async getVideoProgress(userId: string, videoId: string, contentVersion: number) {
    const result = await this.pool.query<ProgressRow>(`${progressSelect} WHERE user_id=$1 AND video_id=$2 AND content_version=$3`, [userId, videoId, contentVersion]);
    return result.rows[0] ? mapProgress(result.rows[0]) : null;
  }
  async upsertVideoProgress(userId: string, value: VideoProgress) {
    const result = await this.pool.query<ProgressRow>(
      `INSERT INTO learning_video_progress (user_id,video_id,content_version,position_seconds,duration_seconds,completed,best_quiz_score,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id,video_id) DO UPDATE SET
         content_version=excluded.content_version,
         position_seconds=CASE WHEN learning_video_progress.content_version<>excluded.content_version THEN excluded.position_seconds ELSE least(
           greatest(learning_video_progress.position_seconds,excluded.position_seconds),
           CASE WHEN excluded.duration_seconds>0 THEN excluded.duration_seconds WHEN learning_video_progress.duration_seconds>0
             THEN learning_video_progress.duration_seconds ELSE greatest(learning_video_progress.position_seconds,excluded.position_seconds) END) END,
         duration_seconds=CASE WHEN learning_video_progress.content_version<>excluded.content_version THEN excluded.duration_seconds
           WHEN excluded.duration_seconds>0 THEN excluded.duration_seconds ELSE learning_video_progress.duration_seconds END,
         completed=CASE WHEN learning_video_progress.content_version<>excluded.content_version THEN excluded.completed
           ELSE learning_video_progress.completed OR excluded.completed END,
         best_quiz_score=CASE WHEN learning_video_progress.content_version<>excluded.content_version THEN excluded.best_quiz_score
           WHEN learning_video_progress.best_quiz_score IS NULL THEN excluded.best_quiz_score
           WHEN excluded.best_quiz_score IS NULL THEN learning_video_progress.best_quiz_score
           ELSE greatest(learning_video_progress.best_quiz_score,excluded.best_quiz_score) END,
         updated_at=excluded.updated_at
       RETURNING video_id,content_version,position_seconds,duration_seconds,completed,best_quiz_score,updated_at`,
      [userId, value.videoId, value.contentVersion, value.positionSeconds, value.durationSeconds, value.completed, value.bestQuizScore, value.updatedAt],
    );
    const row = result.rows[0]; if (!row) throw new Error('Video progress upsert returned no row'); return mapProgress(row);
  }
  async saveQuizResult(userId: string, attempt: QuizAttempt, progress: VideoProgress) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO learning_quiz_attempts (id,user_id,video_id,content_version,score,correct_count,total_count,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [attempt.id, userId, attempt.videoId, attempt.contentVersion, attempt.score, attempt.correctCount,
          attempt.totalCount, attempt.createdAt],
      );
      const result = await client.query<ProgressRow>(
        `INSERT INTO learning_video_progress (user_id,video_id,content_version,position_seconds,duration_seconds,completed,best_quiz_score,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id,video_id) DO UPDATE SET
           content_version=excluded.content_version,
           position_seconds=CASE WHEN learning_video_progress.content_version<>excluded.content_version THEN excluded.position_seconds ELSE least(
             greatest(learning_video_progress.position_seconds,excluded.position_seconds),
             CASE WHEN excluded.duration_seconds>0 THEN excluded.duration_seconds WHEN learning_video_progress.duration_seconds>0
               THEN learning_video_progress.duration_seconds ELSE greatest(learning_video_progress.position_seconds,excluded.position_seconds) END) END,
           duration_seconds=CASE WHEN learning_video_progress.content_version<>excluded.content_version THEN excluded.duration_seconds
             WHEN excluded.duration_seconds>0 THEN excluded.duration_seconds ELSE learning_video_progress.duration_seconds END,
           completed=CASE WHEN learning_video_progress.content_version<>excluded.content_version THEN excluded.completed
             ELSE learning_video_progress.completed OR excluded.completed END,
           best_quiz_score=CASE WHEN learning_video_progress.content_version<>excluded.content_version THEN excluded.best_quiz_score
             WHEN learning_video_progress.best_quiz_score IS NULL THEN excluded.best_quiz_score
             WHEN excluded.best_quiz_score IS NULL THEN learning_video_progress.best_quiz_score
             ELSE greatest(learning_video_progress.best_quiz_score,excluded.best_quiz_score) END,
           updated_at=excluded.updated_at
         RETURNING video_id,content_version,position_seconds,duration_seconds,completed,best_quiz_score,updated_at`,
        [userId, progress.videoId, progress.contentVersion, progress.positionSeconds, progress.durationSeconds, progress.completed,
          progress.bestQuizScore, progress.updatedAt],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Quiz progress upsert returned no row');
      await client.query('COMMIT');
      return mapProgress(row);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async listQuizAttempts(userId: string) {
    const result = await this.pool.query<QuizAttemptRow>(
      `SELECT id,video_id,content_version,score,correct_count,total_count,created_at
       FROM learning_quiz_attempts WHERE user_id=$1 ORDER BY created_at DESC`, [userId],
    );
    return result.rows.map(mapQuizAttempt);
  }
  async listVideoProgress(userId: string) {
    const result = await this.pool.query<ProgressRow>(`${progressSelect} WHERE user_id=$1 ORDER BY updated_at DESC`, [userId]);
    return result.rows.map(mapProgress);
  }
  async saveSubmission(userId: string, value: TaskSubmission) {
    await this.pool.query(
      `INSERT INTO learning_task_submissions (id,user_id,task_id,content_version,language,code,passed_count,total_count,duration_ms,result,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [value.id, userId, value.taskId, value.contentVersion, value.language, value.code, value.passedCount, value.totalCount,
        value.durationMs, JSON.stringify({ tests: value.tests }), value.createdAt],
    );
    await this.pool.query(
      `DELETE FROM learning_task_submissions WHERE id IN (
         SELECT id FROM learning_task_submissions WHERE user_id=$1 AND task_id=$2 ORDER BY created_at DESC OFFSET 50
       )`, [userId, value.taskId],
    );
  }
  async listSubmissions(userId: string, taskId: string, limit: number) {
    const result = await this.pool.query<SubmissionRow>(
      `SELECT id,task_id,content_version,language,code,passed_count,total_count,duration_ms,result,created_at
       FROM learning_task_submissions WHERE user_id=$1 AND task_id=$2 ORDER BY created_at DESC LIMIT $3`,
      [userId, taskId, limit],
    );
    return result.rows.map(mapSubmission);
  }
  async listAllSubmissions(userId: string) {
    const result = await this.pool.query<SubmissionRow>(
      `SELECT id,task_id,content_version,language,code,passed_count,total_count,duration_ms,result,created_at
       FROM learning_task_submissions WHERE user_id=$1 ORDER BY created_at DESC`, [userId],
    );
    return result.rows.map(mapSubmission);
  }
  async createSimulation(userId: string, value: InterviewSimulation) {
    const result = await this.pool.query<SimulationRow>(
      `INSERT INTO learning_simulations
       (id,user_id,specialty,duration_seconds,status,prompts,answers,result,started_at,ends_at,finished_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${simulationColumns}`,
      [value.id, userId, value.specialty, value.durationSeconds, value.status, JSON.stringify(value.prompts),
        JSON.stringify(value.answers), value.result ? JSON.stringify(value.result) : null, value.startedAt, value.endsAt,
        value.finishedAt, value.updatedAt],
    );
    const row = result.rows[0]; if (!row) throw new Error('Simulation insert returned no row'); return mapSimulation(row);
  }
  async getSimulation(userId: string, id: string) {
    const result = await this.pool.query<SimulationRow>(`SELECT ${simulationColumns} FROM learning_simulations WHERE user_id=$1 AND id=$2`, [userId, id]);
    return result.rows[0] ? mapSimulation(result.rows[0]) : null;
  }
  async saveSimulationAnswer(userId: string, id: string, answer: SimulationAnswer) {
    const result = await this.pool.query<SimulationRow>(
      `UPDATE learning_simulations SET
         answers=COALESCE((
           SELECT jsonb_agg(item) FROM jsonb_array_elements(learning_simulations.answers) AS item
           WHERE item->>'promptId' <> $4
         ), '[]'::jsonb) || jsonb_build_array($3::jsonb),
         updated_at=now()
       WHERE user_id=$1 AND id=$2 AND status='active' AND ends_at >= now()
       RETURNING ${simulationColumns}`,
      [userId, id, JSON.stringify(answer), answer.promptId],
    );
    return result.rows[0] ? mapSimulation(result.rows[0]) : null;
  }
  async finishSimulation(userId: string, id: string, finishedAt: string, finalAnswer?: SimulationAnswer) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<SimulationRow>(
        `SELECT ${simulationColumns} FROM learning_simulations WHERE user_id=$1 AND id=$2 FOR UPDATE`, [userId, id],
      );
      const row = selected.rows[0];
      if (!row) { await client.query('COMMIT'); return null; }
      const current = mapSimulation(row);
      if (current.status === 'finished') { await client.query('COMMIT'); return current; }
      if (finalAnswer) {
        current.answers = [...current.answers.filter((item) => item.promptId !== finalAnswer.promptId), finalAnswer];
      }
      const resultValue = analyzeSimulation(current);
      const updated = await client.query<SimulationRow>(
        `UPDATE learning_simulations SET status='finished',answers=$3,result=$4,finished_at=$5,updated_at=$5
         WHERE user_id=$1 AND id=$2 RETURNING ${simulationColumns}`,
        [userId, id, JSON.stringify(current.answers), JSON.stringify(resultValue), finishedAt],
      );
      await client.query('COMMIT');
      return updated.rows[0] ? mapSimulation(updated.rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async listSimulations(userId: string) {
    const result = await this.pool.query<SimulationRow>(`SELECT ${simulationColumns} FROM learning_simulations WHERE user_id=$1 ORDER BY updated_at DESC`, [userId]);
    return result.rows.map(mapSimulation);
  }
  async close() { await this.pool.end(); }
}

const progressSelect = 'SELECT video_id,content_version,position_seconds,duration_seconds,completed,best_quiz_score,updated_at FROM learning_video_progress';
const simulationColumns = 'id,specialty,duration_seconds,status,prompts,answers,result,started_at,ends_at,finished_at,updated_at';
function mapProgress(row: ProgressRow): VideoProgress { return { videoId: row.video_id, contentVersion: row.content_version, positionSeconds: row.position_seconds, durationSeconds: row.duration_seconds, completed: row.completed, bestQuizScore: row.best_quiz_score, updatedAt: row.updated_at.toISOString() }; }
function mapQuizAttempt(row: QuizAttemptRow): QuizAttempt { return { id: row.id, videoId: row.video_id, contentVersion: row.content_version, score: row.score, correctCount: row.correct_count, totalCount: row.total_count, createdAt: row.created_at.toISOString() }; }
function mapSubmission(row: SubmissionRow): TaskSubmission { return { id: row.id, taskId: row.task_id, contentVersion: row.content_version, language: row.language, code: row.code, passedCount: row.passed_count, totalCount: row.total_count, durationMs: row.duration_ms, tests: row.result.tests, createdAt: row.created_at.toISOString() }; }
function mapSimulation(row: SimulationRow): InterviewSimulation { return { id: row.id, specialty: row.specialty, durationSeconds: row.duration_seconds, status: row.status, prompts: row.prompts, answers: row.answers, result: row.result, startedAt: row.started_at.toISOString(), endsAt: row.ends_at.toISOString(), finishedAt: row.finished_at?.toISOString() ?? null, updatedAt: row.updated_at.toISOString() }; }
