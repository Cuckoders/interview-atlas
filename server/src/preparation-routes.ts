import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { specialties } from './domain.js';
import { completionQualities, preparationLevels, skillCatalog } from './preparation-domain.js';
import type { AccountService } from './services/account-service.js';
import type { PreparationService } from './services/preparation-service.js';

const date = z.iso.date();
const timezone = z.string().trim().min(1).max(80).refine((value) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; }
}, 'Invalid timezone');
const profile = z.object({
  specialty: z.enum(specialties), level: z.enum(preparationLevels), targetDate: date,
  targetCompanies: z.array(z.string().trim().min(1).max(100)).max(12).transform((items) => [...new Set(items)]),
  sessionsPerWeek: z.number().int().min(1).max(7), sessionMinutes: z.number().int().min(15).max(120),
  remindersEnabled: z.boolean(), reminderHour: z.number().int().min(0).max(23),
  reminderMinute: z.number().int().min(0).max(59), quietStartMinute: z.number().int().min(0).max(1439),
  quietEndMinute: z.number().int().min(0).max(1439), timezone,
});
const diagnostic = z.object({ ratings: z.record(z.string().min(1).max(80), z.number().int().min(1).max(5)) });
const actionId = z.string().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/);
const sessionId = z.string().min(8).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const completion = z.object({ actionId, quality: z.enum(completionQualities), occurredAt: z.iso.datetime() });

export async function registerPreparationRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  preparation: PreparationService,
): Promise<void> {
  app.get('/v1/preparation', async (request, reply) => {
    noStore(reply);
    const userId = await authenticatedUserId(request, accounts);
    return preparation.snapshot(userId);
  });

  app.put('/v1/preparation/profile', async (request, reply) => {
    noStore(reply);
    const userId = await authenticatedUserId(request, accounts);
    return preparation.saveProfile(userId, profile.parse(request.body));
  });

  app.post('/v1/preparation/diagnostic', async (request, reply) => {
    noStore(reply);
    const userId = await authenticatedUserId(request, accounts);
    const body = diagnostic.parse(request.body);
    return preparation.saveDiagnostic(userId, body.ratings);
  });

  app.post('/v1/preparation/sessions/:id/complete', async (request, reply) => {
    noStore(reply);
    const userId = await authenticatedUserId(request, accounts);
    const { id } = z.object({ id: sessionId }).parse(request.params);
    return preparation.complete(userId, { sessionId: id, ...completion.parse(request.body) });
  });

  app.post('/v1/preparation/plan/regenerate', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    noStore(reply);
    const userId = await authenticatedUserId(request, accounts);
    await preparation.regenerate(userId, 'manual');
    return preparation.snapshot(userId);
  });

  app.get('/v1/preparation/skills/:specialty', async (request) => {
    const { specialty } = z.object({ specialty: z.enum(specialties) }).parse(request.params);
    return { specialty, skills: skillCatalog[specialty] };
  });
}

async function authenticatedUserId(request: FastifyRequest, accounts: AccountService): Promise<string> {
  return (await accounts.authenticate(request.headers.authorization)).user.id;
}
function noStore(reply: FastifyReply): void { reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache'); }
