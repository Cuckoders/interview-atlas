import 'dotenv/config';

import { ArbeitnowAdapter } from './adapters/arbeitnow-adapter.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { MemoryVacancyRepository } from './repositories/memory-vacancy-repository.js';
import { PostgresVacancyRepository } from './repositories/postgres-vacancy-repository.js';
import type { VacancyRepository } from './repositories/vacancy-repository.js';
import { VacancyService } from './services/vacancy-service.js';

const config = loadConfig();
const repository: VacancyRepository = config.databaseUrl
  ? new PostgresVacancyRepository(config.databaseUrl)
  : new MemoryVacancyRepository();
const service = new VacancyService(repository, new ArbeitnowAdapter(config.sourceTimeoutMs), config.sourceRefreshMs);
const app = await buildApp(config, service);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'graceful shutdown');
  await app.close();
  process.exit(0);
};
process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
