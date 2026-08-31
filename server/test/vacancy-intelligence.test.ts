import assert from 'node:assert/strict';
import test from 'node:test';

import type { VacancySourceAdapter } from '../src/adapters/arbeitnow-adapter.js';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { MemoryAccountRepository } from '../src/repositories/memory-account-repository.js';
import { MemoryContentRepository } from '../src/repositories/memory-content-repository.js';
import { MemoryPreparationRepository } from '../src/repositories/memory-preparation-repository.js';
import { MemoryVacancyIntelligenceRepository } from '../src/repositories/memory-vacancy-intelligence-repository.js';
import { MemoryVacancyRepository } from '../src/repositories/memory-vacancy-repository.js';
import { AccountService } from '../src/services/account-service.js';
import { ContentService } from '../src/services/content-service.js';
import { PreparationService } from '../src/services/preparation-service.js';
import { VacancyIntelligenceService } from '../src/services/vacancy-intelligence-service.js';
import { VacancyService } from '../src/services/vacancy-service.js';

const config: AppConfig = {
  host: '127.0.0.1', port: 4000, logLevel: 'silent', trustProxy: false,
  allowedOrigins: ['http://localhost:8081'], sourceRefreshMs: 900_000, sourceTimeoutMs: 5_000,
  authAccessTtlMs: 900_000, authRefreshTtlMs: 2_592_000_000,
};
const adapter: VacancySourceAdapter = {
  source: 'Arbeitnow',
  async fetchLatest() {
    return [{
      slug: 'middle-react-atlas', company_name: 'Atlas', title: 'Middle React Developer',
      description: '<p>React TypeScript GraphQL browser architecture</p>', remote: true,
      url: 'https://www.arbeitnow.com/jobs/middle-react-atlas', tags: ['React', 'TypeScript', 'GraphQL'],
      job_types: ['Full-time'], location: 'Europe', created_at: 1788177600,
    }];
  },
};

test('saved searches deduplicate alerts and match explains a vacancy-specific plan', async () => {
  const vacancyRepository = new MemoryVacancyRepository();
  const vacancyService = new VacancyService(vacancyRepository, adapter, 900_000);
  const accountService = new AccountService(new MemoryAccountRepository());
  const preparationService = new PreparationService(new MemoryPreparationRepository());
  const intelligence = new VacancyIntelligenceService(
    new MemoryVacancyIntelligenceRepository(), vacancyService, accountService, preparationService,
  );
  const app = await buildApp(config, vacancyService, new ContentService(new MemoryContentRepository()),
    accountService, preparationService, intelligence);
  const registered = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: {
    email: 'matcher@example.com', displayName: 'Matcher', password: 'strong-pass-2026', deviceName: 'Android',
  } });
  const headers = { authorization: `Bearer ${registered.json().accessToken}` };
  const feed = await app.inject({ method: 'GET', url: '/v1/vacancies' });
  const vacancy = feed.json().items[0];
  assert.ok(vacancy?.id);

  const target = new Date(); target.setUTCDate(target.getUTCDate() + 30);
  await app.inject({ method: 'PUT', url: '/v1/preparation/profile', headers, payload: {
    specialty: 'Frontend', level: 'Middle', targetDate: target.toISOString().slice(0, 10), targetCompanies: ['Atlas'],
    sessionsPerWeek: 4, sessionMinutes: 30, remindersEnabled: false, reminderHour: 19, reminderMinute: 0,
    quietStartMinute: 1320, quietEndMinute: 480, timezone: 'Europe/Moscow',
  } });
  await app.inject({ method: 'POST', url: '/v1/preparation/diagnostic', headers, payload: { ratings: {
    javascript: 4, typescript: 4, react: 5, browser: 2, 'frontend-architecture': 2,
  } } });

  const match = await app.inject({ method: 'GET', url: `/v1/vacancies/${vacancy.id}/match`, headers });
  assert.equal(match.statusCode, 200, match.body);
  assert.equal(match.json().components.length, 3);
  assert.ok(match.json().matchedSkills.includes('React'));
  assert.ok(match.json().gaps.some((gap: { skill: string }) => gap.skill === 'GraphQL'));
  const plan = await app.inject({ method: 'POST', url: `/v1/vacancies/${vacancy.id}/preparation-plan`, headers });
  assert.equal(plan.statusCode, 200, plan.body);
  assert.ok(plan.json().sessions.length >= 1);
  assert.ok(plan.json().sessions.every((session: { durationMinutes: number }) => session.durationMinutes === 30));

  const created = await app.inject({ method: 'POST', url: '/v1/vacancy-searches', headers, payload: {
    name: 'React remote', query: 'React', specialty: 'Frontend', notificationsEnabled: true, intervalHours: 24,
  } });
  assert.equal(created.statusCode, 201, created.body);
  const firstCheck = await app.inject({ method: 'POST', url: '/v1/vacancy-searches/check', headers, payload: { force: true } });
  assert.equal(firstCheck.statusCode, 200, firstCheck.body);
  assert.equal(firstCheck.json().totalNew, 1);
  const replay = await app.inject({ method: 'POST', url: '/v1/vacancy-searches/check', headers, payload: { force: true } });
  assert.equal(replay.json().totalNew, 0);
  await app.close();
});

test('saved vacancy reports changes until acknowledged and preserves a closed snapshot', async () => {
  const vacancyRepository = new MemoryVacancyRepository();
  const vacancyService = new VacancyService(vacancyRepository, adapter, 900_000);
  const accountService = new AccountService(new MemoryAccountRepository());
  const preparationService = new PreparationService(new MemoryPreparationRepository());
  const intelligence = new VacancyIntelligenceService(
    new MemoryVacancyIntelligenceRepository(), vacancyService, accountService, preparationService,
  );
  const app = await buildApp(config, vacancyService, new ContentService(new MemoryContentRepository()),
    accountService, preparationService, intelligence);
  const registered = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: {
    email: 'status@example.com', displayName: 'Status', password: 'strong-pass-2026', deviceName: 'iPhone',
  } });
  const headers = { authorization: `Bearer ${registered.json().accessToken}` };
  const vacancy = (await app.inject({ method: 'GET', url: '/v1/vacancies' })).json().items[0];
  await app.inject({ method: 'POST', url: '/v1/sync/actions', headers, payload: { actions: [{
    id: 'save-vacancy-0001', type: 'set_vacancy_saved', targetId: vacancy.id, value: true,
    occurredAt: new Date().toISOString(),
  }] } });
  const active = await app.inject({ method: 'GET', url: '/v1/saved-vacancies/status', headers });
  assert.equal(active.json().items[0].status, 'active');
  const stored = await vacancyRepository.findById(vacancy.id);
  assert.ok(stored);
  await vacancyRepository.upsertMany([{ ...stored, salary: '€90k–€110k' }]);
  const changed = await app.inject({ method: 'GET', url: '/v1/saved-vacancies/status', headers });
  assert.equal(changed.json().items[0].status, 'changed');
  assert.ok(changed.json().items[0].changedFields.includes('Зарплата'));
  const acknowledged = await app.inject({ method: 'POST', url: `/v1/saved-vacancies/${vacancy.id}/acknowledge`, headers });
  assert.equal(acknowledged.json().status, 'active');
  vacancyRepository.remove(vacancy.id);
  const closed = await app.inject({ method: 'GET', url: '/v1/saved-vacancies/status', headers });
  assert.equal(closed.json().items[0].status, 'closed');
  assert.equal(closed.json().items[0].vacancy.salary, '€90k–€110k');
  const exported = await app.inject({ method: 'GET', url: '/v1/account/export', headers });
  assert.ok(Array.isArray(exported.json().vacancyIntelligence.savedSearches));
  await app.close();
});
