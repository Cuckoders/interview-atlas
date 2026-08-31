import assert from 'node:assert/strict';
import test from 'node:test';

import type { VacancySourceAdapter } from '../src/adapters/arbeitnow-adapter.js';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { MemoryAccountRepository } from '../src/repositories/memory-account-repository.js';
import { MemoryContentRepository } from '../src/repositories/memory-content-repository.js';
import { MemoryPreparationRepository } from '../src/repositories/memory-preparation-repository.js';
import { MemoryVacancyRepository } from '../src/repositories/memory-vacancy-repository.js';
import { AccountService } from '../src/services/account-service.js';
import { ContentService } from '../src/services/content-service.js';
import { PreparationService } from '../src/services/preparation-service.js';
import { VacancyService } from '../src/services/vacancy-service.js';

const config: AppConfig = {
  host: '127.0.0.1', port: 4000, logLevel: 'silent', trustProxy: false,
  allowedOrigins: ['http://localhost:8081'], sourceRefreshMs: 900_000, sourceTimeoutMs: 5_000,
  authAccessTtlMs: 900_000, authRefreshTtlMs: 2_592_000_000,
};
const adapter: VacancySourceAdapter = { source: 'test', async fetchLatest() { return []; } };

test('diagnostic creates a feasible plan and completion recalculates weak topics idempotently', async () => {
  const app = await buildApp(
    config,
    new VacancyService(new MemoryVacancyRepository(), adapter, 900_000),
    new ContentService(new MemoryContentRepository()),
    new AccountService(new MemoryAccountRepository()),
    new PreparationService(new MemoryPreparationRepository()),
  );
  const registered = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: {
    email: 'planner@example.com', displayName: 'Planner', password: 'strong-pass-2026', deviceName: 'iPhone',
  } });
  const headers = { authorization: `Bearer ${registered.json().accessToken}` };
  const empty = await app.inject({ method: 'GET', url: '/v1/preparation', headers });
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.json().profile, null);

  const target = new Date(); target.setUTCDate(target.getUTCDate() + 45);
  const configured = await app.inject({ method: 'PUT', url: '/v1/preparation/profile', headers, payload: {
    specialty: 'Frontend', level: 'Middle', targetDate: target.toISOString().slice(0, 10),
    targetCompanies: ['Cuckoders'], sessionsPerWeek: 4, sessionMinutes: 35, remindersEnabled: true,
    reminderHour: 19, reminderMinute: 30, quietStartMinute: 1320, quietEndMinute: 480, timezone: 'Europe/Moscow',
  } });
  assert.equal(configured.statusCode, 200, configured.body);
  assert.equal(configured.json().plan.sessions.length, 4);
  assert.ok(configured.json().plan.sessions.every((session: { durationMinutes: number }) => session.durationMinutes === 35));

  const diagnosed = await app.inject({ method: 'POST', url: '/v1/preparation/diagnostic', headers, payload: { ratings: {
    javascript: 2, typescript: 3, react: 4, browser: 1, 'frontend-architecture': 2,
  } } });
  assert.equal(diagnosed.statusCode, 200, diagnosed.body);
  assert.equal(diagnosed.json().skills.find((skill: { key: string }) => skill.key === 'browser').score, 20);
  const session = diagnosed.json().plan.sessions[0];
  const action = { actionId: 'complete:planner:0001', quality: 'good', occurredAt: new Date().toISOString() };
  const completed = await app.inject({ method: 'POST', url: `/v1/preparation/sessions/${session.id}/complete`, headers, payload: action });
  assert.equal(completed.statusCode, 200, completed.body);
  assert.equal(completed.json().plan.sessions.length, 4);
  assert.equal(completed.json().plan.sessions.filter((item: { status: string }) => item.status === 'completed').length, 1);
  assert.equal(completed.json().plan.reason, 'actual_progress');
  const exported = await app.inject({ method: 'GET', url: '/v1/account/export', headers });
  assert.equal(exported.statusCode, 200, exported.body);
  assert.equal(exported.json().preparation.profile.specialty, 'Frontend');
  const replay = await app.inject({ method: 'POST', url: `/v1/preparation/sessions/${session.id}/complete`, headers, payload: action });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().plan.revision, completed.json().plan.revision);
  await app.close();
});

test('preparation endpoints require auth and reject incomplete diagnostics', async () => {
  const app = await buildApp(
    config,
    new VacancyService(new MemoryVacancyRepository(), adapter, 900_000),
    new ContentService(new MemoryContentRepository()),
    new AccountService(new MemoryAccountRepository()),
    new PreparationService(new MemoryPreparationRepository()),
  );
  assert.equal((await app.inject({ method: 'GET', url: '/v1/preparation' })).statusCode, 401);
  const registered = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: {
    email: 'validation@example.com', displayName: 'Validation', password: 'strong-pass-2026', deviceName: 'Android',
  } });
  const headers = { authorization: `Bearer ${registered.json().accessToken}` };
  const target = new Date(); target.setUTCDate(target.getUTCDate() + 14);
  const profilePayload = {
    specialty: 'QA', level: 'Junior', targetDate: target.toISOString().slice(0, 10), targetCompanies: [],
    sessionsPerWeek: 3, sessionMinutes: 25, remindersEnabled: false, reminderHour: 18, reminderMinute: 0,
    quietStartMinute: 1320, quietEndMinute: 480, timezone: 'Europe/Moscow',
  };
  const invalidTimezone = await app.inject({ method: 'PUT', url: '/v1/preparation/profile', headers, payload: {
    ...profilePayload, timezone: 'Not/A_Timezone',
  } });
  assert.equal(invalidTimezone.statusCode, 400);
  const configured = await app.inject({ method: 'PUT', url: '/v1/preparation/profile', headers, payload: profilePayload });
  const firstSession = configured.json().plan.sessions[0];
  const completedWithoutDiagnostic = await app.inject({
    method: 'POST', url: `/v1/preparation/sessions/${firstSession.id}/complete`, headers,
    payload: { actionId: 'pre-diagnostic:complete', quality: 'good', occurredAt: new Date().toISOString() },
  });
  assert.equal(completedWithoutDiagnostic.statusCode, 200, completedWithoutDiagnostic.body);
  assert.equal(completedWithoutDiagnostic.json().skills.find((skill: { key: string }) => skill.key === firstSession.skillKey).score, 47);
  const invalid = await app.inject({ method: 'POST', url: '/v1/preparation/diagnostic', headers, payload: { ratings: { automation: 3 } } });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error.code, 'invalid_diagnostic');
  await app.close();
});
