import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';

import type { AppConfig } from './config.js';
import { ContentError } from './content-domain.js';
import { registerContentRoutes } from './content-routes.js';
import { AccountError } from './account-domain.js';
import { registerAccountRoutes } from './account-routes.js';
import { decodeCursor, InvalidCursorError } from './cursor.js';
import { specialties, workFormats } from './domain.js';
import type { VacancyService } from './services/vacancy-service.js';
import type { ContentService } from './services/content-service.js';
import type { AccountService } from './services/account-service.js';

const querySchema = z.object({
  query: z.string().trim().max(100).optional(),
  specialty: z.enum(specialties).optional(),
  workFormat: z.enum(workFormats).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const idSchema = z.object({ id: z.string().min(1).max(300).regex(/^[a-zA-Z0-9._-]+$/) });

export async function buildApp(
  config: AppConfig, vacancyService: VacancyService, contentService: ContentService, accountService: AccountService,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel, redact: ['req.headers.authorization'] },
    trustProxy: config.trustProxy, bodyLimit: 64 * 1024,
  });
  const allowedOrigins = new Set([
    ...config.allowedOrigins,
    `http://127.0.0.1:${config.port}`,
    `http://localhost:${config.port}`,
  ]);
  await app.register(helmet, { contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
    scriptSrc: ["'self'"], styleSrc: ["'self'"], connectSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
  } } });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) callback(null, true);
      else callback(new Error('Origin not allowed'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });
  app.get('/admin', async (_request, reply) => reply.redirect('/admin-ui/'));
  app.get('/admin-ui/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(
    await readFile(fileURLToPath(new URL('../admin/index.html', import.meta.url))),
  ));
  app.get('/admin-ui/styles.css', async (_request, reply) => reply.type('text/css; charset=utf-8').send(
    await readFile(fileURLToPath(new URL('../admin/styles.css', import.meta.url))),
  ));
  app.get('/admin-ui/app.js', async (_request, reply) => reply.type('text/javascript; charset=utf-8').send(
    await readFile(fileURLToPath(new URL('../admin/app.js', import.meta.url))),
  ));
  app.get('/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok', ...(await vacancyService.stats()), publishedContent: await contentService.countPublished(),
  }));

  app.get('/v1/vacancies', async (request) => {
    const query = querySchema.parse(request.query);
    const cursor = decodeCursor(query.cursor);
    return vacancyService.search({
      ...(query.query ? { query: query.query } : {}),
      ...(query.specialty ? { specialty: query.specialty } : {}),
      ...(query.workFormat ? { workFormat: query.workFormat } : {}),
      ...(cursor ? { cursor } : {}),
      limit: query.limit,
    });
  });

  app.get('/v1/vacancies/:id', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const item = await vacancyService.byId(id);
    if (!item) return reply.code(404).send({ error: { code: 'not_found', message: 'Вакансия не найдена' } });
    return item;
  });
  await registerContentRoutes(app, config, contentService);
  await registerAccountRoutes(app, accountService);

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Маршрут не найден' } }));
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError || error instanceof InvalidCursorError) {
      return reply.code(400).send({ error: { code: 'invalid_request', message: 'Проверьте параметры запроса' } });
    }
    if (error instanceof ContentError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof AccountError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof Error && error.message === 'Origin not allowed') {
      return reply.code(403).send({ error: { code: 'origin_forbidden', message: 'Источник запроса не разрешён' } });
    }
    const statusCode = httpStatusCode(error);
    if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: { code: 'invalid_request', message: 'Проверьте параметры запроса' } });
    }
    request.log.error({ err: error }, 'request failed');
    return reply.code(503).send({ error: { code: 'service_unavailable', message: 'Сервис временно недоступен' } });
  });

  app.addHook('onClose', async () => { await Promise.all([vacancyService.close(), contentService.close(), accountService.close()]); });
  return app;
}

function httpStatusCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return null;
  return typeof error.statusCode === 'number' ? error.statusCode : null;
}
