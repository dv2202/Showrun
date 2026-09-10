import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  ENCRYPTION_KEY: z.string().min(1),
  ADMIN_API_TOKEN: z.string().min(24),
  DEFAULT_USER_ID: z.string().uuid(),
  PLAYWRIGHT_HEADLESS: z.enum(['true', 'false']).default('true'),
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: z.string().optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
  PROXY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
  PROXY_MAX_RESPONSE_BYTES: z.coerce.number().int().min(1024).max(52_428_800).default(10_485_760),
  PROXY_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(1000).default(100),
  LOG_LEVEL: z.string().default('info'),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return schema.parse(environment);
}
