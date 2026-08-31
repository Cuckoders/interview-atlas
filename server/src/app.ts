import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';

import type { AppConfig } from './config.js';
import { decodeCursor, InvalidCursorError } from './cursor.js';
import { specialties, workFormats } from './domain.js';
import type { VacancyService } from './services/vacancy-service.js';

const querySchema = z.object({
  query: z.string().trim().max(100).optional(),
  specialty: z.enum(specialties).optional(),
  workFormat: z.enum(workFormats).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const idSchema = z.object({ id: z.string().min(1).max(300).regex(/^[a-zA-Z0-9._-]+$/) });

export async function buildApp(config: AppConfig, service: VacancyService): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.logLevel }, trustProxy: config.trustProxy, bodyLimit: 64 * 1024 });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error('Origin not allowed'), false);
    },
    methods: ['GET'],
  });
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });

  app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok', ...(await service.stats()) }));

  app.get('/v1/vacancies', async (request) => {
    const query = querySchema.parse(request.query);
    const cursor = decodeCursor(query.cursor);
    return service.search({
      ...(query.query ? { query: query.query } : {}),
      ...(query.specialty ? { specialty: query.specialty } : {}),
      ...(query.workFormat ? { workFormat: query.workFormat } : {}),
      ...(cursor ? { cursor } : {}),
      limit: query.limit,
    });
  });

  app.get('/v1/vacancies/:id', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const item = await service.byId(id);
    if (!item) return reply.code(404).send({ error: { code: 'not_found', message: 'Вакансия не найдена' } });
    return item;
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Маршрут не найден' } }));
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError || error instanceof InvalidCursorError) {
      return reply.code(400).send({ error: { code: 'invalid_request', message: 'Проверьте параметры запроса' } });
    }
    if (error instanceof Error && error.message === 'Origin not allowed') {
      return reply.code(403).send({ error: { code: 'origin_forbidden', message: 'Источник запроса не разрешён' } });
    }
    request.log.error({ err: error }, 'request failed');
    return reply.code(502).send({ error: { code: 'upstream_unavailable', message: 'Источник вакансий временно недоступен' } });
  });

  app.addHook('onClose', async () => service.close());
  return app;
}
