import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { specialties } from './domain.js';
import type { AccountService } from './services/account-service.js';
import type { LearningLabService } from './services/learning-lab-service.js';

const id = z.string().min(1).max(300).regex(/^[A-Za-z0-9._:-]+$/);
const idParams = z.object({ id });
const progress = z.object({
  contentVersion: z.number().int().positive(),
  positionSeconds: z.number().min(0).max(86_400), durationSeconds: z.number().min(0).max(86_400),
  completed: z.boolean().default(false),
});
const contentVersion = z.number().int().positive();
const progressQuery = z.object({ contentVersion: z.coerce.number().int().positive() });
const quiz = z.object({ contentVersion, answers: z.array(z.object({ questionId: id, optionIndex: z.number().int().min(0).max(5) })).max(10) });
const code = z.object({ contentVersion, code: z.string().min(1).max(12_000) });
const simulationInput = z.object({ specialty: z.enum(specialties), durationMinutes: z.number().int().min(5).max(60) });
const simulationAnswer = z.object({ promptId: id, response: z.string().trim().min(1).max(5_000), spentSeconds: z.number().int().min(0).max(3_600) });
const simulationFinish = z.object({ answer: simulationAnswer.optional() });

export async function registerLearningLabRoutes(app: FastifyInstance, accounts: AccountService, service: LearningLabService) {
  app.get('/v1/learning/videos/:id/progress', async (request, reply) => {
    noStore(reply); const user = await authenticate(request, accounts); const { id: videoId } = idParams.parse(request.params);
    return service.videoProgress(user.id, videoId, progressQuery.parse(request.query).contentVersion);
  });
  app.put('/v1/learning/videos/:id/progress', async (request, reply) => {
    noStore(reply); const user = await authenticate(request, accounts); const { id: videoId } = idParams.parse(request.params);
    const body = progress.parse(request.body);
    return service.updateVideoProgress(user.id, videoId, body.contentVersion, body);
  });
  app.post('/v1/learning/videos/:id/quiz', async (request, reply) => {
    noStore(reply); const user = await authenticate(request, accounts); const { id: videoId } = idParams.parse(request.params);
    const body = quiz.parse(request.body);
    return service.gradeQuiz(user.id, videoId, body.contentVersion, body.answers);
  });
  app.post('/v1/learning/tasks/:id/run', { config: { rateLimit: {
    max: 8,
    timeWindow: '1 minute',
    // Authentication happens after the rate-limit hook. Using the client IP here ensures
    // invalid/rotating bearer tokens cannot bypass the limiter and exhaust account lookups.
    keyGenerator: (request: FastifyRequest) => `runner-ip:${request.ip}`,
  } } }, async (request, reply) => {
    noStore(reply); const user = await authenticate(request, accounts); const { id: taskId } = idParams.parse(request.params);
    const body = code.parse(request.body);
    return service.runTask(user.id, taskId, body.contentVersion, body.code);
  });
  app.get('/v1/learning/tasks/:id/submissions', async (request, reply) => {
    noStore(reply); const user = await authenticate(request, accounts); const { id: taskId } = idParams.parse(request.params);
    return service.submissions(user.id, taskId);
  });
  app.post('/v1/learning/simulations', async (request, reply) => {
    noStore(reply); const user = await authenticate(request, accounts); const body = simulationInput.parse(request.body);
    return reply.code(201).send(withServerNow(await service.startSimulation(user.id, body.specialty, body.durationMinutes)));
  });
  app.get('/v1/learning/simulations/:id', async (request, reply) => {
    noStore(reply); const user = await authenticate(request, accounts); const { id: simulationId } = idParams.parse(request.params);
    return withServerNow(await service.simulation(user.id, simulationId));
  });
  app.put('/v1/learning/simulations/:id/answer', async (request, reply) => {
    noStore(reply); const user = await authenticate(request, accounts); const { id: simulationId } = idParams.parse(request.params);
    return withServerNow(await service.answerSimulation(user.id, simulationId, simulationAnswer.parse(request.body)));
  });
  app.post('/v1/learning/simulations/:id/finish', async (request, reply) => {
    noStore(reply); const user = await authenticate(request, accounts); const { id: simulationId } = idParams.parse(request.params);
    return withServerNow(await service.finishSimulation(user.id, simulationId, simulationFinish.parse(request.body ?? {}).answer));
  });
}

async function authenticate(request: FastifyRequest, accounts: AccountService) { return (await accounts.authenticate(request.headers.authorization)).user; }
function noStore(reply: FastifyReply) { reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache'); }
function withServerNow<T extends object>(value: T): T & { serverNow: string } { return { ...value, serverNow: new Date().toISOString() }; }
