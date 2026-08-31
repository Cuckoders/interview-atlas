import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { specialties } from './domain.js';
import type { AccountService } from './services/account-service.js';
import type { PreparationService } from './services/preparation-service.js';
import type { VacancyIntelligenceService } from './services/vacancy-intelligence-service.js';

const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const password = z.string().min(10).max(128);
const deviceName = z.string().trim().min(1).max(100).default('Interview Atlas');
const credentials = z.object({ email, password, deviceName });
const register = credentials.extend({ displayName: z.string().trim().min(2).max(80) });
const refresh = z.object({ refreshToken: z.string().min(60).max(100) });
const deleteAccount = z.object({ password });
const actionId = z.string().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/);
const targetId = z.string().min(1).max(300).regex(/^[A-Za-z0-9._:-]+$/);
const occurredAt = z.iso.datetime();
const progressAction = z.discriminatedUnion('type', [
  z.object({ id: actionId, type: z.literal('set_specialty'), value: z.enum(specialties), occurredAt }),
  z.object({ id: actionId, type: z.literal('set_question_saved'), targetId, value: z.boolean(), occurredAt }),
  z.object({ id: actionId, type: z.literal('set_vacancy_saved'), targetId, value: z.boolean(), occurredAt }),
  z.object({ id: actionId, type: z.literal('set_task_completed'), targetId, value: z.boolean(), occurredAt }),
]);
const actionBatch = z.object({ actions: z.array(progressAction).max(100) });

export async function registerAccountRoutes(
  app: FastifyInstance,
  service: AccountService,
  preparation: PreparationService,
  intelligence: VacancyIntelligenceService,
): Promise<void> {
  app.post('/v1/auth/register', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    noStore(reply);
    const result = await service.register(register.parse(request.body));
    return reply.code(201).send(result);
  });

  app.post('/v1/auth/login', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
    noStore(reply);
    return service.login(credentials.parse(request.body));
  });

  app.post('/v1/auth/refresh', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (request, reply) => {
    noStore(reply);
    const body = refresh.parse(request.body);
    return service.refresh(body.refreshToken);
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    noStore(reply);
    const { accessHash } = await authenticate(request, service);
    await service.logout(accessHash);
    return reply.code(204).send();
  });

  app.get('/v1/account', async (request, reply) => {
    noStore(reply);
    return (await authenticate(request, service)).user;
  });

  app.get('/v1/account/export', async (request, reply) => {
    noStore(reply);
    const { user } = await authenticate(request, service);
    return service.exportData(user, {
      preparation: await preparation.snapshot(user.id),
      vacancyIntelligence: await intelligence.exportData(user.id),
    });
  });

  app.delete('/v1/account', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (request, reply) => {
    noStore(reply);
    const { user } = await authenticate(request, service);
    const body = deleteAccount.parse(request.body);
    await service.deleteAccount(user.id, body.password);
    return reply.code(204).send();
  });

  app.get('/v1/sync', async (request, reply) => {
    noStore(reply);
    const { user } = await authenticate(request, service);
    return service.progress(user.id);
  });

  app.post('/v1/sync/actions', async (request, reply) => {
    noStore(reply);
    const { user } = await authenticate(request, service);
    const body = actionBatch.parse(request.body);
    return service.sync(user.id, body.actions);
  });
}

function authenticate(request: FastifyRequest, service: AccountService) {
  return service.authenticate(request.headers.authorization);
}

function noStore(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
}
