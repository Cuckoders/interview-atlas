import assert from 'node:assert/strict';
import test from 'node:test';

import type { VacancySourceAdapter } from '../src/adapters/arbeitnow-adapter.js';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { analyzeSimulation, type InterviewSimulation } from '../src/learning-lab-domain.js';
import { MemoryAccountRepository } from '../src/repositories/memory-account-repository.js';
import { MemoryContentRepository } from '../src/repositories/memory-content-repository.js';
import { MemoryLearningLabRepository } from '../src/repositories/memory-learning-lab-repository.js';
import { MemoryPreparationRepository } from '../src/repositories/memory-preparation-repository.js';
import { MemoryVacancyRepository } from '../src/repositories/memory-vacancy-repository.js';
import { AccountService } from '../src/services/account-service.js';
import type { CodeRunner } from '../src/services/code-runner.js';
import { ContentService } from '../src/services/content-service.js';
import { LearningLabService } from '../src/services/learning-lab-service.js';
import { PreparationService } from '../src/services/preparation-service.js';
import { VacancyService } from '../src/services/vacancy-service.js';

const config: AppConfig = {
  host: '127.0.0.1', port: 4000, logLevel: 'silent', trustProxy: false,
  allowedOrigins: ['http://localhost:8081'], sourceRefreshMs: 900_000, sourceTimeoutMs: 5_000,
  authAccessTtlMs: 900_000, authRefreshTtlMs: 2_592_000_000,
};
const adapter: VacancySourceAdapter = { source: 'test', async fetchLatest() { return []; } };
const runner: CodeRunner = {
  async run(code, definition) {
    assert.equal(definition.entrypoint, 'double');
    return { passedCount: code.includes('* 2') ? 2 : 0, totalCount: 2, durationMs: 12,
      tests: definition.tests.map((item) => ({ name: item.name, passed: code.includes('* 2') })) };
  },
};

test('simulation score includes response pace', () => {
  const base: InterviewSimulation = {
    id: 'simulation', specialty: 'Frontend', durationSeconds: 900, status: 'active',
    prompts: [{ id: 'prompt', type: 'question', title: 'Event Loop', tags: [] }],
    answers: [], result: null, startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + 900_000).toISOString(),
    finishedAt: null, updatedAt: new Date().toISOString(),
  };
  const response = 'Развёрнутый ответ с допущениями, компромиссами и способом проверки результата.'.repeat(3);
  const scored = (spentSeconds: number) => analyzeSimulation({ ...base, answers: [{
    promptId: 'prompt', response, spentSeconds, answeredAt: new Date().toISOString(),
  }] }).score;
  assert.ok(scored(120) > scored(0));
});

test('runner rate limit also throttles invalid bearer tokens', async () => {
  const content = new ContentService(new MemoryContentRepository());
  const accounts = new AccountService(new MemoryAccountRepository());
  const app = await buildApp(
    config,
    new VacancyService(new MemoryVacancyRepository(), adapter, 900_000),
    content,
    accounts,
    new PreparationService(new MemoryPreparationRepository()),
  );
  const statuses: number[] = [];
  for (let index = 0; index < 9; index += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/learning/tasks/missing/run',
      headers: { authorization: `Bearer invalid-token-${index}` },
      payload: { contentVersion: 1, code: 'function solve() {}' },
    });
    statuses.push(response.statusCode);
  }
  assert.deepEqual(statuses.slice(0, 8), Array(8).fill(401));
  assert.equal(statuses[8], 429);
  await app.close();
});

test('advanced learning persists video, grades quiz, runs code and finishes a simulation', async () => {
  const content = new ContentService(new MemoryContentRepository());
  const video = await publish(content, 'video', 'Видео про Event Loop', {
    author: 'Interview Atlas', durationMinutes: 10, url: 'https://example.com/event-loop.mp4',
    quiz: [{ id: 'loop-order', prompt: 'Что выполняется первым?', options: ['microtask', 'timer'], correctIndex: 0, explanation: 'Microtask queue очищается раньше.' }],
  });
  const task = await publish(content, 'task', 'Удвоить число', {
    description: 'Верните удвоенное число.', difficulty: 'Начальный', estimatedMinutes: 10, skills: ['JavaScript'],
    starterCode: 'function double(value) { return value; }', solution: 'Умножьте аргумент на два.',
    runner: { language: 'javascript', entrypoint: 'double', tests: [
      { name: 'positive', args: [2], expected: 4 }, { name: 'negative', args: [-3], expected: -6 },
    ] },
  });
  await publish(content, 'question', 'Event Loop', { shortAnswer: 'Очереди.', fullAnswer: 'Стек и очереди.', difficulty: 'Средний' });
  await publish(content, 'question', 'Promise', { shortAnswer: 'Асинхронность.', fullAnswer: 'Microtask.', difficulty: 'Средний' });
  await publish(content, 'question', 'Render', { shortAnswer: 'Обновление.', fullAnswer: 'Render и commit.', difficulty: 'Средний' });

  const accounts = new AccountService(new MemoryAccountRepository());
  const preparation = new PreparationService(new MemoryPreparationRepository());
  const learningRepository = new MemoryLearningLabRepository();
  const learning = new LearningLabService(learningRepository, content, runner);
  const app = await buildApp(config, new VacancyService(new MemoryVacancyRepository(), adapter, 900_000),
    content, accounts, preparation, undefined, learning);
  const registration = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: {
    email: 'learner@example.com', displayName: 'Learner', password: 'strong-pass-2026', deviceName: 'iPhone',
  } });
  const headers = { authorization: `Bearer ${registration.json().accessToken}` };

  const migratedOfflineProgress = await learning.updateVideoProgress('offline-guest', video.id, video.version, {
    positionSeconds: 30, durationSeconds: 600, completed: true,
  });
  assert.equal(migratedOfflineProgress.completed, true);

  const publicVideo = await app.inject({ method: 'GET', url: `/v1/content/${video.id}` });
  assert.equal(publicVideo.statusCode, 200);
  assert.equal(publicVideo.json().payload.quiz[0].correctIndex, undefined);
  const publicTask = await app.inject({ method: 'GET', url: `/v1/content/${task.id}` });
  assert.equal(publicTask.json().payload.runner.tests, undefined);
  assert.equal((await app.inject({ method: 'GET', url: `/v1/learning/videos/${video.id}/progress` })).statusCode, 401);

  const progress = await app.inject({ method: 'PUT', url: `/v1/learning/videos/${video.id}/progress`, headers,
    payload: { contentVersion: video.version, positionSeconds: 550, durationSeconds: 600 } });
  assert.equal(progress.statusCode, 200, progress.body);
  assert.equal(progress.json().completed, true);
  const fallbackProgress = await app.inject({ method: 'PUT', url: '/v1/learning/videos/video-js-loop/progress', headers,
    payload: { contentVersion: 1, positionSeconds: 90, durationSeconds: 840 } });
  assert.equal(fallbackProgress.statusCode, 200, fallbackProgress.body);
  assert.equal(fallbackProgress.json().positionSeconds, 90);
  const restoredFallback = await app.inject({ method: 'GET', url: '/v1/learning/videos/video-js-loop/progress?contentVersion=1', headers });
  assert.equal(restoredFallback.statusCode, 200, restoredFallback.body);
  assert.equal(restoredFallback.json().positionSeconds, 90);
  const incompleteQuiz = await app.inject({ method: 'POST', url: `/v1/learning/videos/${video.id}/quiz`, headers,
    payload: { contentVersion: video.version, answers: [] } });
  assert.equal(incompleteQuiz.statusCode, 400);
  assert.equal(incompleteQuiz.json().error.code, 'invalid_quiz_answers');
  const invalidOptionQuiz = await app.inject({ method: 'POST', url: `/v1/learning/videos/${video.id}/quiz`, headers,
    payload: { contentVersion: video.version, answers: [{ questionId: 'loop-order', optionIndex: 2 }] } });
  assert.equal(invalidOptionQuiz.statusCode, 400);
  assert.equal(invalidOptionQuiz.json().error.code, 'invalid_quiz_answers');
  const quiz = await app.inject({ method: 'POST', url: `/v1/learning/videos/${video.id}/quiz`, headers,
    payload: { contentVersion: video.version, answers: [{ questionId: 'loop-order', optionIndex: 0 }] } });
  assert.equal(quiz.json().score, 100);
  assert.equal(quiz.json().contentVersion, video.version);
  assert.equal(quiz.json().results[0].correctIndex, 0);
  const weakerQuiz = await app.inject({ method: 'POST', url: `/v1/learning/videos/${video.id}/quiz`, headers,
    payload: { contentVersion: video.version, answers: [{ questionId: 'loop-order', optionIndex: 1 }] } });
  assert.equal(weakerQuiz.json().score, 0);
  const replayed = await app.inject({ method: 'PUT', url: `/v1/learning/videos/${video.id}/progress`, headers,
    payload: { contentVersion: video.version, positionSeconds: 30, durationSeconds: 600 } });
  assert.equal(replayed.json().positionSeconds, 550);
  assert.equal(replayed.json().completed, true);
  assert.equal(replayed.json().bestQuizScore, 100);
  const shortenedVideo = await app.inject({ method: 'PUT', url: `/v1/learning/videos/${video.id}/progress`, headers,
    payload: { contentVersion: video.version, positionSeconds: 290, durationSeconds: 300 } });
  assert.equal(shortenedVideo.json().positionSeconds, 300);
  assert.equal(shortenedVideo.json().durationSeconds, 300);
  assert.equal(shortenedVideo.json().completed, true);

  const run = await app.inject({ method: 'POST', url: `/v1/learning/tasks/${task.id}/run`, headers,
    payload: { contentVersion: task.version, code: 'function double(value) { return value * 2; }' } });
  assert.equal(run.statusCode, 200, run.body);
  assert.equal(run.json().passedCount, 2);
  const staleRun = await app.inject({ method: 'POST', url: `/v1/learning/tasks/${task.id}/run`, headers,
    payload: { contentVersion: task.version + 1, code: 'function double(value) { return value * 2; }' } });
  assert.equal(staleRun.statusCode, 409);
  const history = await app.inject({ method: 'GET', url: `/v1/learning/tasks/${task.id}/submissions`, headers });
  assert.equal(history.json().length, 1);
  assert.equal(history.json()[0].contentVersion, task.version);

  const started = await app.inject({ method: 'POST', url: '/v1/learning/simulations', headers,
    payload: { specialty: 'Frontend', durationMinutes: 15 } });
  assert.equal(started.statusCode, 201, started.body);
  const simulation = started.json();
  assert.equal(typeof simulation.serverNow, 'string');
  assert.ok(simulation.prompts.length >= 3);
  assert.equal(simulation.prompts.find((item: { type: string }) => item.type === 'task')?.statement, 'Верните удвоенное число.');
  const answered = await app.inject({ method: 'PUT', url: `/v1/learning/simulations/${simulation.id}/answer`, headers,
    payload: { promptId: simulation.prompts[0].id, response: 'Подробный структурированный ответ с несколькими шагами и проверкой допущений.'.repeat(2), spentSeconds: 45 } });
  assert.equal(answered.statusCode, 200, answered.body);
  const finished = await app.inject({ method: 'POST', url: `/v1/learning/simulations/${simulation.id}/finish`, headers,
    payload: { answer: { promptId: simulation.prompts[1].id, response: 'Черновик сохраняется вместе с завершением интервью.', spentSeconds: 30 } } });
  assert.equal(finished.json().status, 'finished');
  assert.equal(finished.json().result.answeredCount, 2);
  const expiredSimulation: InterviewSimulation = {
    ...simulation, id: 'expired-simulation', status: 'active', answers: [], result: null,
    endsAt: new Date(Date.now() - 1_000).toISOString(), finishedAt: null,
  };
  await learningRepository.createSimulation(registration.json().user.id, expiredSimulation);
  const expiredFinished = await learning.finishSimulation(registration.json().user.id, expiredSimulation.id, {
    promptId: expiredSimulation.prompts[0]!.id, response: 'Этот ответ пришёл после дедлайна.', spentSeconds: 30,
  });
  assert.equal(expiredFinished.result?.answeredCount, 0);
  await learningRepository.upsertVideoProgress(registration.json().user.id, {
    videoId: 'versioned-video', contentVersion: 1, positionSeconds: 590, durationSeconds: 600,
    completed: true, bestQuizScore: 100, updatedAt: new Date().toISOString(),
  });
  const revisedProgress = await learningRepository.upsertVideoProgress(registration.json().user.id, {
    videoId: 'versioned-video', contentVersion: 2, positionSeconds: 10, durationSeconds: 900,
    completed: false, bestQuizScore: null, updatedAt: new Date().toISOString(),
  });
  assert.equal(await learningRepository.getVideoProgress(registration.json().user.id, 'versioned-video', 1), null);
  assert.equal(revisedProgress.positionSeconds, 10);
  assert.equal(revisedProgress.completed, false);
  assert.equal(revisedProgress.bestQuizScore, null);
  const exported = await app.inject({ method: 'GET', url: '/v1/account/export', headers });
  assert.equal(exported.json().advancedLearning.videoProgress[0].bestQuizScore, 100);
  assert.equal(exported.json().advancedLearning.quizAttempts.length, 2);
  assert.equal(exported.json().advancedLearning.taskSubmissions[0].code, 'function double(value) { return value * 2; }');
  await app.close();
});

async function publish(content: ContentService, type: 'video' | 'task' | 'question', title: string, payload: Record<string, unknown>) {
  const draft = await content.create({ type, specialty: 'Frontend', title, tags: ['JavaScript'], sourceLabel: 'Interview Atlas',
    sourceUrl: 'https://example.com/source', nextReviewAt: '2027-01-01T00:00:00.000Z', editor: 'Test editor', payload } as never);
  await content.transition(draft.id, 'review', 1);
  return content.transition(draft.id, 'published', 1);
}
