import {
  analyzeSimulation, type InterviewSimulation, type QuizAttempt, type SimulationAnswer, type TaskSubmission, type VideoProgress,
} from '../learning-lab-domain.js';
import type { LearningLabRepository } from './learning-lab-repository.js';

export class MemoryLearningLabRepository implements LearningLabRepository {
  private readonly progress = new Map<string, VideoProgress>();
  private readonly attempts = new Map<string, QuizAttempt[]>();
  private readonly submissions = new Map<string, TaskSubmission[]>();
  private readonly simulations = new Map<string, InterviewSimulation>();

  async getVideoProgress(userId: string, videoId: string, contentVersion: number) {
    const value = this.progress.get(key(userId, videoId));
    return clone(value?.contentVersion === contentVersion ? value : null);
  }
  async upsertVideoProgress(userId: string, value: VideoProgress) {
    const stored = this.progress.get(key(userId, value.videoId));
    const current = stored?.contentVersion === value.contentVersion ? stored : null;
    const durationSeconds = value.durationSeconds > 0 ? value.durationSeconds : current?.durationSeconds ?? 0;
    const furthestPosition = Math.max(value.positionSeconds, current?.positionSeconds ?? 0);
    const merged: VideoProgress = {
      ...value,
      positionSeconds: durationSeconds > 0 ? Math.min(furthestPosition, durationSeconds) : furthestPosition,
      durationSeconds,
      completed: current?.completed === true || value.completed,
      bestQuizScore: maxScore(current?.bestQuizScore ?? null, value.bestQuizScore),
      updatedAt: value.updatedAt,
    };
    this.progress.set(key(userId, value.videoId), clone(merged));
    return clone(merged);
  }
  async saveQuizResult(userId: string, attempt: QuizAttempt, progress: VideoProgress) {
    const entry = key(userId, attempt.videoId);
    this.attempts.set(entry, [...(this.attempts.get(entry) ?? []), clone(attempt)]);
    return this.upsertVideoProgress(userId, progress);
  }
  async listQuizAttempts(userId: string) {
    return clone([...this.attempts.entries()].filter(([entry]) => entry.startsWith(`${userId}:`))
      .flatMap(([, values]) => values).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async listVideoProgress(userId: string) {
    return clone([...this.progress.entries()].filter(([entry]) => entry.startsWith(`${userId}:`)).map(([, value]) => value));
  }
  async saveSubmission(userId: string, submission: TaskSubmission) {
    const entry = key(userId, submission.taskId);
    this.submissions.set(entry, [clone(submission), ...(this.submissions.get(entry) ?? [])].slice(0, 50));
  }
  async listSubmissions(userId: string, taskId: string, limit: number) {
    return clone((this.submissions.get(key(userId, taskId)) ?? []).slice(0, limit));
  }
  async listAllSubmissions(userId: string) {
    return clone([...this.submissions.entries()].filter(([entry]) => entry.startsWith(`${userId}:`))
      .flatMap(([, values]) => values).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async createSimulation(userId: string, simulation: InterviewSimulation) {
    this.simulations.set(key(userId, simulation.id), clone(simulation)); return clone(simulation);
  }
  async getSimulation(userId: string, id: string) { return clone(this.simulations.get(key(userId, id)) ?? null); }
  async saveSimulationAnswer(userId: string, id: string, answer: SimulationAnswer) {
    const entry = key(userId, id); const simulation = this.simulations.get(entry); if (!simulation) return null;
    if (simulation.status !== 'active' || Date.now() > Date.parse(simulation.endsAt)) return null;
    simulation.answers = [...simulation.answers.filter((item) => item.promptId !== answer.promptId), clone(answer)];
    simulation.updatedAt = new Date().toISOString(); return clone(simulation);
  }
  async finishSimulation(userId: string, id: string, finishedAt: string, finalAnswer?: SimulationAnswer) {
    const simulation = this.simulations.get(key(userId, id)); if (!simulation) return null;
    if (simulation.status === 'finished') return clone(simulation);
    if (finalAnswer) {
      simulation.answers = [...simulation.answers.filter((item) => item.promptId !== finalAnswer.promptId), clone(finalAnswer)];
    }
    simulation.status = 'finished'; simulation.result = analyzeSimulation(simulation);
    simulation.finishedAt = finishedAt; simulation.updatedAt = finishedAt;
    return clone(simulation);
  }
  async listSimulations(userId: string) {
    return clone([...this.simulations.entries()].filter(([entry]) => entry.startsWith(`${userId}:`))
      .map(([, value]) => value).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }
  async close() {}
}

function key(userId: string, id: string) { return `${userId}:${id}`; }
function clone<T>(value: T): T { return value === null ? value : structuredClone(value); }
function maxScore(a: number | null, b: number | null) { return a === null ? b : b === null ? a : Math.max(a, b); }
