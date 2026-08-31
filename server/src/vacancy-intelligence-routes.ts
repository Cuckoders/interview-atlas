import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { specialties, workFormats } from './domain.js';
import type { AccountService } from './services/account-service.js';
import type { VacancyIntelligenceService } from './services/vacancy-intelligence-service.js';
import { alertIntervals } from './vacancy-intelligence-domain.js';
import type { SavedVacancySearchInput } from './vacancy-intelligence-domain.js';

const searchId = z.uuid();
const vacancyId = z.string().min(1).max(300).regex(/^[a-zA-Z0-9._-]+$/);
const savedSearch = z.object({
  name: z.string().trim().min(1).max(80),
  query: z.string().trim().min(1).max(100).optional(),
  specialty: z.enum(specialties).optional(),
  workFormat: z.enum(workFormats).optional(),
  notificationsEnabled: z.boolean(),
  intervalHours: z.union(alertIntervals.map((value) => z.literal(value)) as [z.ZodLiteral<6>, z.ZodLiteral<24>, z.ZodLiteral<168>]),
}).refine((value) => value.query || value.specialty || value.workFormat, {
  message: 'At least one vacancy filter is required',
});

export async function registerVacancyIntelligenceRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  service: VacancyIntelligenceService,
): Promise<void> {
  app.get('/v1/vacancy-searches', async (request, reply) => {
    noStore(reply);
    return service.listSearches(await userId(request, accounts));
  });
  app.post('/v1/vacancy-searches', async (request, reply) => {
    noStore(reply);
    return reply.code(201).send(await service.createSearch(await userId(request, accounts), parseSearch(request.body)));
  });
  app.put('/v1/vacancy-searches/:id', async (request, reply) => {
    noStore(reply);
    const { id } = z.object({ id: searchId }).parse(request.params);
    return service.updateSearch(await userId(request, accounts), id, parseSearch(request.body));
  });
  app.delete('/v1/vacancy-searches/:id', async (request, reply) => {
    noStore(reply);
    const { id } = z.object({ id: searchId }).parse(request.params);
    await service.deleteSearch(await userId(request, accounts), id);
    return reply.code(204).send();
  });
  app.post('/v1/vacancy-searches/check', { config: { rateLimit: { max: 12, timeWindow: '1 hour' } } }, async (request, reply) => {
    noStore(reply);
    const { force } = z.object({ force: z.boolean().default(false) }).parse(request.body ?? {});
    return service.checkSearches(await userId(request, accounts), force);
  });
  app.get('/v1/vacancies/:id/match', async (request, reply) => {
    noStore(reply);
    const { id } = z.object({ id: vacancyId }).parse(request.params);
    return service.match(await userId(request, accounts), id);
  });
  app.get('/v1/vacancies/:id/preparation-plan', async (request, reply) => {
    noStore(reply);
    const { id } = z.object({ id: vacancyId }).parse(request.params);
    return { plan: await service.getPlan(await userId(request, accounts), id) };
  });
  app.post('/v1/vacancies/:id/preparation-plan', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    noStore(reply);
    const { id } = z.object({ id: vacancyId }).parse(request.params);
    return service.generatePlan(await userId(request, accounts), id);
  });
  app.get('/v1/saved-vacancies/status', async (request, reply) => {
    noStore(reply);
    return { items: await service.savedStatuses(await userId(request, accounts)) };
  });
  app.post('/v1/saved-vacancies/:id/acknowledge', async (request, reply) => {
    noStore(reply);
    const { id } = z.object({ id: vacancyId }).parse(request.params);
    return service.acknowledgeStatus(await userId(request, accounts), id);
  });
}

async function userId(request: FastifyRequest, accounts: AccountService) {
  return (await accounts.authenticate(request.headers.authorization)).user.id;
}
function noStore(reply: FastifyReply) { reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache'); }
function parseSearch(value: unknown): SavedVacancySearchInput {
  const parsed = savedSearch.parse(value);
  return {
    name: parsed.name, notificationsEnabled: parsed.notificationsEnabled, intervalHours: parsed.intervalHours,
    ...(parsed.query ? { query: parsed.query } : {}),
    ...(parsed.specialty ? { specialty: parsed.specialty } : {}),
    ...(parsed.workFormat ? { workFormat: parsed.workFormat } : {}),
  };
}
