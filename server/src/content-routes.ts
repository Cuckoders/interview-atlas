import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from './config.js';
import { contentStatuses, contentTypes, difficulties } from './content-domain.js';
import { decodeCursor } from './cursor.js';
import { specialties } from './domain.js';
import type { ContentService } from './services/content-service.js';

const httpsUrl = z.url().refine((value) => value.startsWith('https://'), 'Требуется HTTPS URL');
const playableVideoUrl = httpsUrl.refine((value) => {
  try { return new URL(value).pathname.toLowerCase().endsWith('.mp4'); }
  catch { return false; }
}, 'Требуется прямая ссылка на кроссплатформенное MP4-видео');
const quizQuestion = z.object({
  id: z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/),
  prompt: z.string().trim().min(3).max(1_000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  correctIndex: z.number().int().min(0).max(5),
  explanation: z.string().trim().min(1).max(2_000),
}).refine((value) => value.correctIndex < value.options.length, { message: 'correctIndex выходит за варианты ответа' });
const videoQuiz = z.array(quizQuestion).min(1).max(10).superRefine((questions, context) => {
  const seen = new Set<string>();
  questions.forEach((question, index) => {
    if (seen.has(question.id)) {
      context.addIssue({ code: 'custom', message: 'ID вопроса квиза должен быть уникальным', path: [index, 'id'] });
    }
    seen.add(question.id);
  });
});
const runnerEntrypoint = z.string().min(1).max(80).regex(/^[A-Za-z_$][\w$]*$/)
  .refine(isLegalRunnerBinding, 'entrypoint должен быть допустимым именем JavaScript-функции');
const runner = z.object({
  language: z.literal('javascript'),
  entrypoint: runnerEntrypoint,
  tests: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    args: z.array(z.json()).max(20),
    expected: z.json(),
  })).min(1).max(20),
});

function isLegalRunnerBinding(value: string): boolean {
  try { new Function(`"use strict"; var ${value};`); return true; }
  catch { return false; }
}
const common = {
  specialty: z.enum(specialties), title: z.string().trim().min(3).max(300),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  sourceLabel: z.string().trim().min(2).max(120), sourceUrl: httpsUrl.optional(),
  nextReviewAt: z.iso.datetime({ offset: true }), editor: z.string().trim().min(2).max(120),
};
const contentInputSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('question'), payload: z.object({
    shortAnswer: z.string().trim().min(1).max(2_000), fullAnswer: z.string().trim().min(1).max(30_000),
    difficulty: z.enum(difficulties),
  }) }),
  z.object({ ...common, type: z.literal('task'), payload: z.object({
    description: z.string().trim().min(1).max(10_000), difficulty: z.enum(difficulties),
    estimatedMinutes: z.number().int().min(1).max(480),
    skills: z.array(z.string().trim().min(1).max(50)).max(30),
    starterCode: z.string().max(30_000).optional(), solution: z.string().trim().min(1).max(50_000),
    runner: runner.optional(),
  }).superRefine((value, context) => {
    if (value.runner && value.starterCode && value.starterCode.length > 12_000) {
      context.addIssue({ code: 'custom', message: 'Starter code runner-задачи не должен превышать 12 000 символов', path: ['starterCode'] });
    }
  }) }),
  z.object({ ...common, type: z.literal('video'), payload: z.object({
    author: z.string().trim().min(2).max(120), durationMinutes: z.number().int().min(1).max(600), url: playableVideoUrl,
    quiz: videoQuiz.optional(),
  }) }),
  z.object({ ...common, type: z.literal('track'), payload: z.object({
    description: z.string().trim().min(1).max(10_000), lessons: z.number().int().min(1).max(500),
    durationMinutes: z.number().int().min(1).max(100_000),
  }) }),
]);
const publicQuerySchema = z.object({
  type: z.enum(contentTypes).optional(), specialty: z.enum(specialties).optional(),
  cursor: z.string().max(500).optional(), limit: z.coerce.number().int().min(1).max(50).default(20),
});
const adminQuerySchema = z.object({
  type: z.enum(contentTypes).optional(), specialty: z.enum(specialties).optional(),
  status: z.enum(contentStatuses).optional(), limit: z.coerce.number().int().min(1).max(200).default(100),
});
const idSchema = z.object({ id: z.string().min(1).max(300).regex(/^[a-zA-Z0-9._-]+$/) });
const reviseSchema = z.object({ expectedVersion: z.number().int().positive(), content: contentInputSchema });
const transitionSchema = z.object({ expectedVersion: z.number().int().positive(), status: z.enum(contentStatuses) });

export async function registerContentRoutes(
  app: FastifyInstance, config: AppConfig, service: ContentService,
): Promise<void> {
  app.get('/v1/content', async (request) => {
    const query = publicQuerySchema.parse(request.query);
    const cursor = decodeCursor(query.cursor);
    return service.listPublished({
      ...(query.type ? { type: query.type } : {}),
      ...(query.specialty ? { specialty: query.specialty } : {}),
      ...(cursor ? { cursor } : {}), limit: query.limit,
    });
  });

  app.get('/v1/content/:id', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const item = await service.findPublished(id);
    if (!item) return reply.code(404).send({ error: { code: 'not_found', message: 'Материал не найден' } });
    return item;
  });

  const adminGuard = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.cmsAdminToken) {
      return reply.code(503).send({ error: { code: 'cms_disabled', message: 'CMS не настроена' } });
    }
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!safeEqual(token, config.cmsAdminToken)) {
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'Требуется токен редактора' } });
    }
  };
  const adminOptions = { preHandler: adminGuard, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  app.get('/admin/content', adminOptions, async (request) => {
    const query = adminQuerySchema.parse(request.query);
    return service.listAdmin({
      ...(query.type ? { type: query.type } : {}),
      ...(query.specialty ? { specialty: query.specialty } : {}),
      ...(query.status ? { status: query.status } : {}),
      limit: query.limit,
    });
  });
  app.post('/admin/content', adminOptions, async (request, reply) => {
    const input = contentInputSchema.parse(request.body);
    return reply.code(201).send(await service.create(input));
  });
  app.put('/admin/content/:id', adminOptions, async (request) => {
    const { id } = idSchema.parse(request.params);
    const body = reviseSchema.parse(request.body);
    return service.revise(id, body.content, body.expectedVersion);
  });
  app.post('/admin/content/:id/transition', adminOptions, async (request) => {
    const { id } = idSchema.parse(request.params);
    const body = transitionSchema.parse(request.body);
    return service.transition(id, body.status, body.expectedVersion);
  });
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
