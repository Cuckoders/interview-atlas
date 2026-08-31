import assert from 'node:assert/strict';
import test from 'node:test';

import type { VacancySourceAdapter } from '../src/adapters/arbeitnow-adapter.js';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { MemoryContentRepository } from '../src/repositories/memory-content-repository.js';
import { MemoryVacancyRepository } from '../src/repositories/memory-vacancy-repository.js';
import { ContentService } from '../src/services/content-service.js';
import { VacancyService } from '../src/services/vacancy-service.js';

const token = 'test-editor-token-with-at-least-32-characters';
const config: AppConfig = {
  host: '127.0.0.1', port: 4000, logLevel: 'silent', trustProxy: false,
  allowedOrigins: ['http://localhost:8081'], sourceRefreshMs: 900_000, sourceTimeoutMs: 5_000,
  cmsAdminToken: token,
};
const vacancyAdapter: VacancySourceAdapter = { source: 'test', async fetchLatest() { return []; } };
const content = {
  type: 'question', specialty: 'Frontend', title: 'Как работает reconciliation?',
  tags: ['React'], sourceLabel: 'React documentation', sourceUrl: 'https://react.dev/',
  nextReviewAt: '2026-12-01T10:00:00.000Z', editor: 'QA Editor',
  payload: { shortAnswer: 'React сравнивает деревья.', fullAnswer: 'Подробный ответ.', difficulty: 'Средний' },
};

test('CMS keeps the published version visible while a new draft is edited', async () => {
  const app = await buildApp(
    config,
    new VacancyService(new MemoryVacancyRepository(), vacancyAdapter, 900_000),
    new ContentService(new MemoryContentRepository()),
  );
  const unauthorized = await app.inject({ method: 'GET', url: '/admin/content' });
  assert.equal(unauthorized.statusCode, 401);

  const created = await app.inject({
    method: 'POST', url: '/admin/content', headers: { authorization: `Bearer ${token}` }, payload: content,
  });
  assert.equal(created.statusCode, 201);
  const draft = created.json();
  assert.equal(draft.status, 'draft');
  assert.equal((await app.inject({ method: 'GET', url: '/v1/content?type=question' })).json().items.length, 0);

  const review = await transition(app, draft.id, 1, 'review');
  assert.equal(review.status, 'review');
  const published = await transition(app, draft.id, 1, 'published');
  assert.equal(published.status, 'published');

  const revisedResponse = await app.inject({
    method: 'PUT', url: `/admin/content/${draft.id}`, headers: { authorization: `Bearer ${token}` },
    payload: { expectedVersion: 1, content: { ...content, title: 'Reconciliation в React' } },
  });
  assert.equal(revisedResponse.statusCode, 200);
  const revised = revisedResponse.json();
  assert.equal(revised.version, 2);
  assert.equal(revised.status, 'draft');
  const publicDuringEdit = (await app.inject({ method: 'GET', url: `/v1/content/${draft.id}` })).json();
  assert.equal(publicDuringEdit.version, 1);

  await transition(app, draft.id, 2, 'review');
  await transition(app, draft.id, 2, 'published');
  const publicAfterPublish = (await app.inject({ method: 'GET', url: `/v1/content/${draft.id}` })).json();
  assert.equal(publicAfterPublish.version, 2);
  assert.equal(publicAfterPublish.title, 'Reconciliation в React');
  await app.close();
});

test('CMS validates workflow and HTTPS sources', async () => {
  const app = await buildApp(
    config,
    new VacancyService(new MemoryVacancyRepository(), vacancyAdapter, 900_000),
    new ContentService(new MemoryContentRepository()),
  );
  const invalid = await app.inject({
    method: 'POST', url: '/admin/content', headers: { authorization: `Bearer ${token}` },
    payload: { ...content, sourceUrl: 'http://unsafe.example' },
  });
  assert.equal(invalid.statusCode, 400);
  const created = await app.inject({
    method: 'POST', url: '/admin/content', headers: { authorization: `Bearer ${token}` }, payload: content,
  });
  const draft = created.json();
  const publishDraft = await app.inject({
    method: 'POST', url: `/admin/content/${draft.id}/transition`, headers: { authorization: `Bearer ${token}` },
    payload: { expectedVersion: 1, status: 'published' },
  });
  assert.equal(publishDraft.statusCode, 409);
  assert.equal(publishDraft.json().error.code, 'invalid_transition');
  await app.close();
});

async function transition(app: Awaited<ReturnType<typeof buildApp>>, id: string, version: number, status: string) {
  const response = await app.inject({
    method: 'POST', url: `/admin/content/${id}/transition`, headers: { authorization: `Bearer ${token}` },
    payload: { expectedVersion: version, status },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}
