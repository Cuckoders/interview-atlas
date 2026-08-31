import assert from 'node:assert/strict';
import test from 'node:test';

import type { VacancySourceAdapter } from '../src/adapters/arbeitnow-adapter.js';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { MemoryAccountRepository } from '../src/repositories/memory-account-repository.js';
import { MemoryContentRepository } from '../src/repositories/memory-content-repository.js';
import { MemoryVacancyRepository } from '../src/repositories/memory-vacancy-repository.js';
import { MemoryPreparationRepository } from '../src/repositories/memory-preparation-repository.js';
import { AccountService } from '../src/services/account-service.js';
import { ContentService } from '../src/services/content-service.js';
import { VacancyService } from '../src/services/vacancy-service.js';
import { PreparationService } from '../src/services/preparation-service.js';

const config: AppConfig = {
  host: '127.0.0.1', port: 4000, logLevel: 'silent', trustProxy: false,
  allowedOrigins: ['http://localhost:8081'], sourceRefreshMs: 900_000, sourceTimeoutMs: 5_000,
  authAccessTtlMs: 900_000, authRefreshTtlMs: 2_592_000_000,
};
const adapter: VacancySourceAdapter = { source: 'test', async fetchLatest() { return []; } };

test('account sessions rotate and protected routes reject reused tokens', async () => {
  const app = await testApp();
  assert.equal((await app.inject({ method: 'GET', url: '/v1/account' })).statusCode, 401);

  const registered = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: {
    email: 'Candidate@Example.com', displayName: 'Candidate', password: 'strong-pass-2026', deviceName: 'iPhone',
  } });
  assert.equal(registered.statusCode, 201, registered.body);
  assert.equal(registered.headers['cache-control'], 'no-store');
  const initial = registered.json();
  assert.equal(initial.user.email, 'candidate@example.com');

  const duplicate = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: {
    email: 'candidate@example.com', displayName: 'Another', password: 'strong-pass-2026', deviceName: 'Android',
  } });
  assert.equal(duplicate.statusCode, 409);

  const refreshed = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: initial.refreshToken } });
  assert.equal(refreshed.statusCode, 200, refreshed.body);
  const rotated = refreshed.json();
  assert.notEqual(rotated.refreshToken, initial.refreshToken);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: initial.refreshToken } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/account', headers: bearer(initial.accessToken) })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/account', headers: bearer(rotated.accessToken) })).statusCode, 200);
  await app.close();
});

test('sync actions are idempotent and account export/delete are authorized', async () => {
  const app = await testApp();
  const registered = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: {
    email: 'sync@example.com', displayName: 'Sync User', password: 'strong-pass-2026', deviceName: 'Pixel',
  } });
  const session = registered.json();
  const headers = bearer(session.accessToken);
  const action = {
    id: 'action:2026:0001', type: 'set_question_saved', targetId: 'question-1', value: true,
    occurredAt: new Date().toISOString(),
  };
  const first = await app.inject({ method: 'POST', url: '/v1/sync/actions', headers, payload: { actions: [action] } });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().progress.version, 1);
  assert.deepEqual(first.json().progress.savedQuestionIds, ['question-1']);
  const replay = await app.inject({ method: 'POST', url: '/v1/sync/actions', headers, payload: { actions: [action] } });
  assert.equal(replay.json().progress.version, 1);

  const exported = await app.inject({ method: 'GET', url: '/v1/account/export', headers });
  assert.equal(exported.statusCode, 200);
  assert.equal(exported.json().progress.savedQuestionIds[0], 'question-1');
  assert.equal((await app.inject({ method: 'DELETE', url: '/v1/account', headers, payload: { password: 'wrong-password' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'DELETE', url: '/v1/account', headers, payload: { password: 'strong-pass-2026' } })).statusCode, 204);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/account', headers })).statusCode, 401);
  await app.close();
});

test('login returns generic credentials error and validates password policy', async () => {
  const app = await testApp();
  const weak = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: {
    email: 'weak@example.com', displayName: 'Weak User', password: 'short', deviceName: 'Web',
  } });
  assert.equal(weak.statusCode, 400);
  const missing = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: {
    email: 'missing@example.com', password: 'strong-pass-2026', deviceName: 'Web',
  } });
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.json().error.code, 'invalid_credentials');
  const emptyJson = await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: { 'content-type': 'application/json' } });
  assert.equal(emptyJson.statusCode, 400);
  await app.close();
});

async function testApp() {
  return buildApp(
    config,
    new VacancyService(new MemoryVacancyRepository(), adapter, 900_000),
    new ContentService(new MemoryContentRepository()),
    new AccountService(new MemoryAccountRepository()),
    new PreparationService(new MemoryPreparationRepository()),
  );
}

function bearer(token: string) { return { authorization: `Bearer ${token}` }; }
