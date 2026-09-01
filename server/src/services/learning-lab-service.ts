import { randomUUID } from 'node:crypto';

import type { TaskPayload, VideoPayload } from '../content-domain.js';
import type { Specialty } from '../domain.js';
import {
  LearningLabError, type InterviewSimulation, type QuizAttempt, type SimulationAnswer, type SimulationPrompt,
  type TaskSubmission, type VideoProgress,
} from '../learning-lab-domain.js';
import type { LearningLabRepository } from '../repositories/learning-lab-repository.js';
import {
  CodeRunnerExecutionError, CodeRunnerTimeoutError, CodeRunnerUnavailableError, type CodeRunner,
} from './code-runner.js';
import type { ContentService } from './content-service.js';

const bundledVideoIds = new Set(['video-js-loop', 'video-system-design', 'video-mobile']);

export class LearningLabService {
  constructor(
    private readonly repository: LearningLabRepository,
    private readonly content: ContentService,
    private readonly codeRunner: CodeRunner,
  ) {}

  async videoProgress(userId: string, videoId: string, contentVersion: number) {
    await this.requireProgressVideo(videoId, contentVersion);
    return this.repository.getVideoProgress(userId, videoId, contentVersion);
  }

  async updateVideoProgress(userId: string, videoId: string, contentVersion: number, input: { positionSeconds: number; durationSeconds: number; completed: boolean }) {
    await this.requireProgressVideo(videoId, contentVersion);
    const current = await this.repository.getVideoProgress(userId, videoId, contentVersion);
    const incomingPosition = Math.min(Math.round(input.positionSeconds), Math.round(input.durationSeconds || input.positionSeconds));
    const reportedDuration = Math.round(input.durationSeconds);
    const durationSeconds = reportedDuration > 0 ? reportedDuration : current?.durationSeconds ?? 0;
    const furthestPosition = Math.max(current?.positionSeconds ?? 0, incomingPosition);
    const positionSeconds = durationSeconds > 0 ? Math.min(furthestPosition, durationSeconds) : furthestPosition;
    const progress: VideoProgress = {
      videoId, contentVersion, positionSeconds, durationSeconds,
      completed: current?.completed === true || input.completed || (durationSeconds > 0 && positionSeconds / durationSeconds >= 0.9),
      bestQuizScore: current?.bestQuizScore ?? null,
      updatedAt: new Date().toISOString(),
    };
    return this.repository.upsertVideoProgress(userId, progress);
  }

  async gradeQuiz(userId: string, videoId: string, contentVersion: number, answers: { questionId: string; optionIndex: number }[]) {
    const item = await this.requireContent(videoId, 'video');
    this.requireVersion(item.version, contentVersion);
    const quiz = (item.payload as VideoPayload).quiz;
    if (!quiz?.length) throw new LearningLabError(409, 'quiz_unavailable', 'Для видео пока нет теста');
    const questionById = new Map(quiz.map((question) => [question.id, question]));
    const answeredIds = new Set(answers.map((answer) => answer.questionId));
    const completeAndValid = answers.length === quiz.length
      && answeredIds.size === quiz.length
      && answers.every((answer) => {
        const question = questionById.get(answer.questionId);
        return question !== undefined && answer.optionIndex < question.options.length;
      });
    if (!completeAndValid) {
      throw new LearningLabError(400, 'invalid_quiz_answers', 'Ответьте ровно один раз на каждый вопрос теста');
    }
    const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.optionIndex]));
    const results = quiz.map((question) => ({
      questionId: question.id,
      correct: answerMap.get(question.id) === question.correctIndex,
      correctIndex: question.correctIndex,
      explanation: question.explanation,
    }));
    const correctCount = results.filter((result) => result.correct).length;
    const score = Math.round(correctCount / quiz.length * 100);
    const attempt: QuizAttempt = {
      id: randomUUID(), videoId, contentVersion, score, correctCount, totalCount: quiz.length, createdAt: new Date().toISOString(),
    };
    const current = await this.repository.getVideoProgress(userId, videoId, contentVersion);
    await this.repository.saveQuizResult(userId, attempt, {
      videoId, contentVersion, positionSeconds: current?.positionSeconds ?? 0, durationSeconds: current?.durationSeconds ?? 0,
      completed: current?.completed ?? false,
      bestQuizScore: Math.max(score, current?.bestQuizScore ?? 0),
      updatedAt: attempt.createdAt,
    });
    return { ...attempt, results };
  }

  async runTask(userId: string, taskId: string, contentVersion: number, code: string) {
    const item = await this.requireContent(taskId, 'task');
    this.requireVersion(item.version, contentVersion);
    const runner = (item.payload as TaskPayload).runner;
    if (!runner) throw new LearningLabError(409, 'runner_unavailable', 'Для этой задачи нет автоматических тестов');
    try {
      const result = await this.codeRunner.run(code, runner);
      const submission: TaskSubmission = {
        id: randomUUID(), taskId, contentVersion, language: runner.language, code, ...result, createdAt: new Date().toISOString(),
      };
      await this.repository.saveSubmission(userId, submission);
      return submission;
    } catch (error) {
      if (error instanceof CodeRunnerTimeoutError) throw new LearningLabError(408, 'execution_timeout', error.message);
      if (error instanceof CodeRunnerUnavailableError) throw new LearningLabError(503, 'runner_unavailable', error.message);
      if (error instanceof CodeRunnerExecutionError) throw new LearningLabError(422, 'execution_failed', error.message);
      throw error;
    }
  }

  async submissions(userId: string, taskId: string) {
    await this.requireContent(taskId, 'task');
    return this.repository.listSubmissions(userId, taskId, 20);
  }

  async startSimulation(userId: string, specialty: Specialty, durationMinutes: number) {
    const [questions, tasks] = await Promise.all([
      this.content.listPublished({ type: 'question', specialty, limit: 20 }),
      this.content.listPublished({ type: 'task', specialty, limit: 20 }),
    ]);
    const prompts = interleave(
      questions.items.map(toPrompt), tasks.items.map(toPrompt),
    ).slice(0, 5);
    if (prompts.length < 3) {
      throw new LearningLabError(409, 'insufficient_content', 'Для симуляции нужно минимум три опубликованных материала');
    }
    const startedAt = new Date();
    const simulation: InterviewSimulation = {
      id: randomUUID(), specialty, durationSeconds: durationMinutes * 60, status: 'active', prompts, answers: [], result: null,
      startedAt: startedAt.toISOString(), endsAt: new Date(startedAt.getTime() + durationMinutes * 60_000).toISOString(),
      finishedAt: null, updatedAt: startedAt.toISOString(),
    };
    return this.repository.createSimulation(userId, simulation);
  }

  async simulation(userId: string, id: string) {
    const value = await this.repository.getSimulation(userId, id);
    if (!value) throw new LearningLabError(404, 'simulation_not_found', 'Симуляция не найдена');
    return value;
  }

  async answerSimulation(userId: string, id: string, input: { promptId: string; response: string; spentSeconds: number }) {
    const simulation = await this.simulation(userId, id);
    if (simulation.status !== 'active') throw new LearningLabError(409, 'simulation_finished', 'Симуляция уже завершена');
    if (Date.now() > Date.parse(simulation.endsAt)) throw new LearningLabError(409, 'simulation_expired', 'Время симуляции истекло');
    if (!simulation.prompts.some((prompt) => prompt.id === input.promptId)) {
      throw new LearningLabError(400, 'unknown_prompt', 'Вопрос не принадлежит симуляции');
    }
    const answer: SimulationAnswer = { ...input, answeredAt: new Date().toISOString() };
    const updated = await this.repository.saveSimulationAnswer(userId, id, answer);
    if (!updated) throw new LearningLabError(409, 'simulation_finished', 'Симуляция уже завершена');
    return updated;
  }

  async finishSimulation(userId: string, id: string, finalInput?: { promptId: string; response: string; spentSeconds: number }) {
    const simulation = await this.simulation(userId, id);
    if (simulation.status === 'finished') return simulation;
    if (finalInput && !simulation.prompts.some((prompt) => prompt.id === finalInput.promptId)) {
      throw new LearningLabError(400, 'unknown_prompt', 'Вопрос не принадлежит симуляции');
    }
    const finishedAt = new Date().toISOString();
    const finalAnswer: SimulationAnswer | undefined = finalInput && Date.parse(finishedAt) <= Date.parse(simulation.endsAt)
      ? { ...finalInput, answeredAt: finishedAt }
      : undefined;
    const updated = await this.repository.finishSimulation(userId, id, finishedAt, finalAnswer);
    if (!updated) throw new LearningLabError(404, 'simulation_not_found', 'Симуляция не найдена');
    return updated;
  }

  async exportData(userId: string) {
    const [videoProgress, quizAttempts, taskSubmissions, simulations] = await Promise.all([
      this.repository.listVideoProgress(userId), this.repository.listQuizAttempts(userId),
      this.repository.listAllSubmissions(userId), this.repository.listSimulations(userId),
    ]);
    return { videoProgress, quizAttempts, taskSubmissions, simulations };
  }

  async close() { await this.repository.close(); }

  private async requireContent(id: string, type: 'video' | 'task') {
    const item = await this.content.findPublishedRaw(id);
    if (!item || item.type !== type) throw new LearningLabError(404, 'content_not_found', 'Опубликованный материал не найден');
    return item;
  }

  private async requireProgressVideo(id: string, contentVersion: number) {
    if (bundledVideoIds.has(id)) {
      this.requireVersion(1, contentVersion);
      return;
    }
    const item = await this.requireContent(id, 'video');
    this.requireVersion(item.version, contentVersion);
  }

  private requireVersion(actual: number, requested: number) {
    if (actual !== requested) throw new LearningLabError(409, 'content_revision_changed', 'Материал обновлён — откройте актуальную версию');
  }
}

function toPrompt(item: { id: string; type: string; title: string; tags: string[]; payload: Record<string, unknown> }): SimulationPrompt {
  const type = item.type === 'task' ? 'task' : 'question';
  const statement = type === 'task' && typeof item.payload.description === 'string' ? item.payload.description : undefined;
  return { id: item.id, type, title: item.title, ...(statement ? { statement } : {}), tags: item.tags };
}
function interleave<T>(left: T[], right: T[]): T[] {
  const result: T[] = [];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (index < left.length) result.push(left[index]!);
    if (index < right.length) result.push(right[index]!);
  }
  return result;
}
