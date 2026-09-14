import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../src/config.js';
import { TargetPolicy } from '../src/security/target-policy.js';

export const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 3000,
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:5432/unused',
    ENCRYPTION_KEY: TEST_KEY,
    FRONTEND_URL: 'http://localhost:3000',
    AUTH_PUBLIC_API_URL: 'http://localhost:3000/backend-api',
    AUTH_COOKIE_NAME: 'showrun_session',
    AUTH_SESSION_TTL_SECONDS: 2_592_000,
    PLAYWRIGHT_HEADLESS: 'true',
    SESSION_TTL_SECONDS: 3600,
    PROXY_TIMEOUT_MS: 1000,
    PROXY_MAX_RESPONSE_BYTES: 1_000_000,
    PROXY_MAX_CONCURRENCY: 10,
    SHOWCASE_PREVIEW_PROTOCOL: 'http',
    SHOWCASE_PREVIEW_DOMAIN: 'localhost',
    SHOWCASE_PREVIEW_PORT: 3000,
    SHOWCASE_LEGACY_PATH_PROXY: 'true',
    LOG_LEVEL: 'silent',
    ...overrides,
  };
}

export function publicPolicy(): TargetPolicy {
  return new TargetPolicy(async () => [{ address: '93.184.216.34', family: 4 }]);
}

export async function authenticatedHeaders(app: FastifyInstance): Promise<{ cookie: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/email/register',
    payload: {
      name: 'Test Creator',
      email: 'test-creator@example.com',
      password: 'test-creator-password',
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(`Could not create test session: ${response.statusCode} ${response.body}`);
  }
  const setCookie = response.headers['set-cookie'];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!header) throw new Error('Expected registration to set a session cookie');
  return { cookie: header.split(';')[0]! };
}
