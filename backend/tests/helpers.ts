import type { AppConfig } from '../src/config.js';
import { TargetPolicy } from '../src/security/target-policy.js';

export const TEST_TOKEN = 'test-admin-token-that-is-long-enough';
export const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 3000,
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:5432/unused',
    ENCRYPTION_KEY: TEST_KEY,
    ADMIN_API_TOKEN: TEST_TOKEN,
    DEFAULT_USER_ID: '00000000-0000-4000-8000-000000000001',
    PLAYWRIGHT_HEADLESS: 'true',
    SESSION_TTL_SECONDS: 3600,
    PROXY_TIMEOUT_MS: 1000,
    PROXY_MAX_RESPONSE_BYTES: 1_000_000,
    PROXY_MAX_CONCURRENCY: 10,
    LOG_LEVEL: 'silent',
    ...overrides,
  };
}

export function publicPolicy(): TargetPolicy {
  return new TargetPolicy(async () => [{ address: '93.184.216.34', family: 4 }]);
}

export const adminHeaders = { authorization: `Bearer ${TEST_TOKEN}` };
