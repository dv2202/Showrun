import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url(),
  ENCRYPTION_KEY: z.string().min(1),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  AUTH_PUBLIC_API_URL: z.string().url().default('http://localhost:3000/backend-api'),
  AUTH_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default('showrun_session'),
  AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(31_536_000).default(2_592_000),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  PLAYWRIGHT_HEADLESS: z.enum(['true', 'false']).default('true'),
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: z.string().optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
  PROXY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
  PROXY_MAX_RESPONSE_BYTES: z.coerce.number().int().min(1024).max(52_428_800).default(10_485_760),
  PROXY_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(1000).default(100),
  REMOTE_BROWSER_MAX_SESSIONS: z.coerce.number().int().min(1).max(200).default(20),
  REMOTE_BROWSER_IDLE_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(180),
  SHOWCASE_PREVIEW_PROTOCOL: z.enum(['http', 'https']).default('http'),
  SHOWCASE_PREVIEW_DOMAIN: z.string().trim().toLowerCase().regex(/^(?:localhost|[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)$/).default('localhost'),
  SHOWCASE_PREVIEW_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  SHOWCASE_LEGACY_PATH_PROXY: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.string().default('info'),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return schema.parse(environment);
}
