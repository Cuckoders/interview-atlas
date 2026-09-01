import 'dotenv/config';

import { ArbeitnowAdapter } from './adapters/arbeitnow-adapter.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { MemoryVacancyRepository } from './repositories/memory-vacancy-repository.js';
import { MemoryContentRepository } from './repositories/memory-content-repository.js';
import { PostgresContentRepository } from './repositories/postgres-content-repository.js';
import type { ContentRepository } from './repositories/content-repository.js';
import { PostgresVacancyRepository } from './repositories/postgres-vacancy-repository.js';
import type { VacancyRepository } from './repositories/vacancy-repository.js';
import { VacancyService } from './services/vacancy-service.js';
import { ContentService } from './services/content-service.js';
import { MemoryAccountRepository } from './repositories/memory-account-repository.js';
import { PostgresAccountRepository } from './repositories/postgres-account-repository.js';
import type { AccountRepository } from './repositories/account-repository.js';
import { AccountService } from './services/account-service.js';
import { MemoryPreparationRepository } from './repositories/memory-preparation-repository.js';
import { PostgresPreparationRepository } from './repositories/postgres-preparation-repository.js';
import type { PreparationRepository } from './repositories/preparation-repository.js';
import { PreparationService } from './services/preparation-service.js';
import { MemoryVacancyIntelligenceRepository } from './repositories/memory-vacancy-intelligence-repository.js';
import { PostgresVacancyIntelligenceRepository } from './repositories/postgres-vacancy-intelligence-repository.js';
import type { VacancyIntelligenceRepository } from './repositories/vacancy-intelligence-repository.js';
import { VacancyIntelligenceService } from './services/vacancy-intelligence-service.js';
import { MemoryLearningLabRepository } from './repositories/memory-learning-lab-repository.js';
import { PostgresLearningLabRepository } from './repositories/postgres-learning-lab-repository.js';
import type { LearningLabRepository } from './repositories/learning-lab-repository.js';
import { DisabledCodeRunner, DockerCodeRunner } from './services/code-runner.js';
import { LearningLabService } from './services/learning-lab-service.js';

const config = loadConfig();
const repository: VacancyRepository = config.databaseUrl
  ? new PostgresVacancyRepository(config.databaseUrl)
  : new MemoryVacancyRepository();
const service = new VacancyService(repository, new ArbeitnowAdapter(config.sourceTimeoutMs), config.sourceRefreshMs);
const contentRepository: ContentRepository = config.databaseUrl
  ? new PostgresContentRepository(config.databaseUrl)
  : new MemoryContentRepository();
const contentService = new ContentService(contentRepository);
const accountRepository: AccountRepository = config.databaseUrl
  ? new PostgresAccountRepository(config.databaseUrl)
  : new MemoryAccountRepository();
const accountService = new AccountService(accountRepository, config.authAccessTtlMs, config.authRefreshTtlMs);
const preparationRepository: PreparationRepository = config.databaseUrl
  ? new PostgresPreparationRepository(config.databaseUrl)
  : new MemoryPreparationRepository();
const preparationService = new PreparationService(preparationRepository);
const intelligenceRepository: VacancyIntelligenceRepository = config.databaseUrl
  ? new PostgresVacancyIntelligenceRepository(config.databaseUrl)
  : new MemoryVacancyIntelligenceRepository();
const intelligenceService = new VacancyIntelligenceService(
  intelligenceRepository, service, accountService, preparationService,
);
const learningRepository: LearningLabRepository = config.databaseUrl
  ? new PostgresLearningLabRepository(config.databaseUrl)
  : new MemoryLearningLabRepository();
const codeRunner = config.codeRunnerEnabled
  ? new DockerCodeRunner(config.codeRunnerImage ?? 'node:24-alpine')
  : new DisabledCodeRunner();
const learningService = new LearningLabService(learningRepository, contentService, codeRunner);
const app = await buildApp(
  config, service, contentService, accountService, preparationService, intelligenceService, learningService,
);

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
