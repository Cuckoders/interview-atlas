import { z } from 'zod';

const envSchema = z.object({
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.stringbool().default(false),
  ALLOWED_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
  DATABASE_URL: z.string().min(1).optional(),
  SOURCE_REFRESH_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(900_000),
  SOURCE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(25_000),
});

export type AppConfig = {
  host: string;
  port: number;
  logLevel: z.infer<typeof envSchema>['LOG_LEVEL'];
  trustProxy: boolean;
  allowedOrigins: string[];
  databaseUrl?: string;
  sourceRefreshMs: number;
  sourceTimeoutMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const config: AppConfig = {
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    trustProxy: parsed.TRUST_PROXY,
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean),
    sourceRefreshMs: parsed.SOURCE_REFRESH_MS,
    sourceTimeoutMs: parsed.SOURCE_TIMEOUT_MS,
  };
  if (parsed.DATABASE_URL) config.databaseUrl = parsed.DATABASE_URL;
  return config;
}
