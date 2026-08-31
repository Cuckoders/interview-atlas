import assert from 'node:assert/strict';
import test from 'node:test';

import type { VacancySourceAdapter } from '../src/adapters/arbeitnow-adapter.js';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { MemoryVacancyRepository } from '../src/repositories/memory-vacancy-repository.js';
import { VacancyService } from '../src/services/vacancy-service.js';

const config: AppConfig = {
  host: '127.0.0.1', port: 4000, logLevel: 'silent', trustProxy: false, allowedOrigins: ['http://localhost:8081'],
  sourceRefreshMs: 900_000, sourceTimeoutMs: 5_000,
};
const adapter: VacancySourceAdapter = {
  source: 'Arbeitnow',
  async fetchLatest() {
    return [{
      slug: 'react-developer', company_name: 'Atlas', title: 'React Developer',
      description: '<p>React and TypeScript</p>', remote: true,
      url: 'https://www.arbeitnow.com/jobs/react-developer', tags: ['React'],
      job_types: ['Full-time'], location: 'Europe', created_at: 1788177600,
    }];
  },
};

test('vacancy endpoint imports, filters and does not duplicate', async () => {
  const repository = new MemoryVacancyRepository();
  const app = await buildApp(config, new VacancyService(repository, adapter, 900_000));
  const first = await app.inject({ method: 'GET', url: '/v1/vacancies?specialty=Frontend&limit=10' });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().items.length, 1);
  const second = await app.inject({ method: 'GET', url: '/v1/vacancies' });
  assert.equal(second.statusCode, 200);
  assert.equal(await repository.count(), 1);
  await app.close();
});

test('vacancy endpoint rejects unknown filters and invalid ids', async () => {
  const app = await buildApp(config, new VacancyService(new MemoryVacancyRepository(), adapter, 900_000));
  assert.equal((await app.inject({ method: 'GET', url: '/v1/vacancies?specialty=Design' })).statusCode, 400);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/vacancies/not%20safe' })).statusCode, 400);
  await app.close();
});
