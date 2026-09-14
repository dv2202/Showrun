import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { buildApp } from '../src/api/app.js';
import type { AuthenticationProvider } from '../src/auth/providers.js';
import { SessionBridge } from '../src/proxy/session-bridge.js';
import { PreviewOriginRouter } from '../src/proxy/preview-origin.js';
import { SecureHttpClient, type SecureHttpRequest, type SecureHttpResponse } from '../src/proxy/secure-http-client.js';
import { MemoryShowcaseRepository } from '../src/storage/memory-repository.js';
import { authenticatedHeaders, publicPolicy, testConfig, TEST_KEY } from './helpers.js';

class RecordingHttpClient extends SecureHttpClient {
  urls: URL[] = [];
  attachedHeaders: Array<Record<string, string | string[] | undefined>> = [];
  nextStatus = 200;
  nextBody: string | Buffer = '<a href="/next">Next</a><a href="https://external.example/docs">External</a>';
  nextHeaders: Record<string, string> = {
    'content-type': 'text/html',
    'set-cookie': 'upstream-secret=value',
    'access-control-allow-origin': '*',
  };

  constructor() {
    super(publicPolicy(), 1000, 100_000);
  }

  override async fetch(input: string | URL, options: SecureHttpRequest = {}): Promise<SecureHttpResponse> {
    const url = new URL(input);
    this.urls.push(url);
    this.attachedHeaders.push(options.headersForUrl?.(url, 0) ?? options.headers ?? {});
    return {
      status: this.nextStatus,
      headers: this.nextHeaders,
      body: Buffer.isBuffer(this.nextBody) ? this.nextBody : Buffer.from(this.nextBody),
      finalUrl: url,
    };
  }
}

const payload = {
  name: 'Proxy App', slug: 'proxy-app', targetUrl: 'https://example.com/base/',
  mode: 'selected_routes',
  routes: [
    { path: '/path', title: 'Path', description: '' },
    { path: '/next', title: 'Next', description: '' },
  ],
  authentication: {
    provider: 'token', config: { headerName: 'authorization', prefix: 'Bearer ' },
    secret: { token: 'server-token' },
  },
};

class StoragePasswordProvider implements AuthenticationProvider {
  readonly kind = 'password' as const;

  async authenticate() {
    return {
      origins: [{
        origin: 'https://example.com',
        localStorage: [{ name: 'access_token', value: 'real-access-token' }],
      }],
    };
  }
}

class SessionStoragePasswordProvider implements AuthenticationProvider {
  readonly kind = 'password' as const;

  async authenticate() {
    return {
      sessionOrigins: [{
        origin: 'https://example.com',
        sessionStorage: [{ name: 'session_token', value: 'real-session-storage-token' }],
      }],
    };
  }
}

class CookiePasswordProvider implements AuthenticationProvider {
  readonly kind = 'password' as const;
  async authenticate() {
    return {
      cookies: [{
        name: 'sid', value: 'real-cookie-value', domain: 'example.com', path: '/', expires: -1,
        httpOnly: true, secure: true, sameSite: 'Lax' as const,
      }],
      sessionCandidates: [{
        storage: 'cookie' as const,
        name: 'sid',
        confidence: 'high' as const,
        requestHeaders: ['cookie'],
      }],
    };
  }
}

describe('secure proxy behavior', () => {
  it('redirects legacy path-based requests to the isolated preview origin', async () => {
    const app = await buildApp({
      config: testConfig(),
      repository: new MemoryShowcaseRepository(),
      policy: publicPolicy(),
      http: new RecordingHttpClient(),
    });
    const headers = await authenticatedHeaders(app);
    await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    const response = await app.inject({
      method: 'GET', url: '/showcase/proxy-app/path?tab=activity',
    });
    expect(response.statusCode).toBe(307);
    expect(response.headers.location).toBe('http://proxy-app.localhost:3000/path?tab=activity');
    await app.close();
  });

  it('serves root-relative application and API paths from an isolated preview host', async () => {
    const repository = new MemoryShowcaseRepository();
    const http = new RecordingHttpClient();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    await repository.updateShowcase(created.json().id, {
      dependencies: [{
        path: '/api/session', targetPath: '/api/session', targetOrigin: 'https://example.com',
        originAlias: null, search: '', contentType: 'application/json', category: 'read_api',
        approved: true, contentHash: 'hash', discoveredAt: new Date().toISOString(),
      }],
    });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });

    const page = await app.inject({
      method: 'GET', url: '/path', headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('href="/next"');
    expect(page.body).not.toContain('https://example.com');
    expect(page.headers['content-security-policy']).toContain('http://proxy-app.localhost:3000');

    http.nextHeaders = { 'content-type': 'application/json' };
    http.nextBody = '{"user":{"id":1}}';
    const api = await app.inject({
      method: 'GET', url: '/api/session', headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(api.statusCode).toBe(200);
    expect(http.urls.at(-1)?.href).toBe('https://example.com/api/session');

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/session',
      headers: {
        host: 'proxy-app.localhost:3000',
        'access-control-request-headers': 'authorization, x-client-version',
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-headers']).toContain('authorization');
    const mutation = await app.inject({
      method: 'POST', url: '/path', headers: { host: 'proxy-app.localhost:3000' }, payload: '{}',
    });
    expect(mutation.statusCode).toBe(405);

    const adminEscape = await app.inject({
      method: 'GET', url: '/api/showcases', headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(adminEscape.statusCode).toBe(404);
    await app.close();
  });

  it('routes approved secondary origins through opaque host aliases only', async () => {
    const repository = new MemoryShowcaseRepository();
    const http = new RecordingHttpClient();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    const router = new PreviewOriginRouter({ protocol: 'http', domain: 'localhost', port: 3000 });
    const alias = router.originAlias('https://api.example.net', 'https://example.com')!;
    await repository.updateShowcase(created.json().id, {
      dependencies: [{
        path: '/v1/summary', targetPath: '/v1/summary', targetOrigin: 'https://api.example.net',
        originAlias: alias, search: '?range=month', contentType: 'application/json',
        category: 'read_api', approved: true, contentHash: 'hash', redactedFields: [],
        discoveredAt: new Date().toISOString(),
      }],
    });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });
    http.nextHeaders = { 'content-type': 'application/json' };
    http.nextBody = '{"total":42}';

    const allowed = await app.inject({
      method: 'GET',
      url: '/v1/summary?range=month',
      headers: {
        host: `${alias}--proxy-app.localhost:3000`,
        origin: 'http://proxy-app.localhost:3000',
      },
    });
    expect(allowed.statusCode).toBe(200);
    expect(http.urls.at(-1)?.origin).toBe('https://api.example.net');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://proxy-app.localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const requests = http.urls.length;
    const denied = await app.inject({
      method: 'GET',
      url: '/v1/admin',
      headers: { host: `${alias}--proxy-app.localhost:3000` },
    });
    expect(denied.statusCode).toBe(404);
    expect(http.urls).toHaveLength(requests);
    await app.close();
  });

  it('redacts approved JSON fields before returning page data', async () => {
    const repository = new MemoryShowcaseRepository();
    const http = new RecordingHttpClient();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    await repository.updateShowcase(created.json().id, {
      dependencies: [{
        path: '/api/profile', targetPath: '/api/profile', targetOrigin: 'https://example.com',
        originAlias: null, search: '', contentType: 'application/json', category: 'read_api',
        approved: true, redactedFields: ['/user/email', '/token'], contentHash: 'hash',
        discoveredAt: new Date().toISOString(),
      }],
    });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });
    http.nextHeaders = { 'content-type': 'application/json' };
    http.nextBody = '{"user":{"email":"private@example.com","name":"Demo"},"token":"secret"}';
    const response = await app.inject({
      method: 'GET', url: '/api/profile', headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(response.json()).toEqual({
      user: { email: '[REDACTED]', name: 'Demo' }, token: '[REDACTED]',
    });
    await app.close();
  });

  it('fails closed when an approved redacted response is not valid JSON', async () => {
    const repository = new MemoryShowcaseRepository();
    const http = new RecordingHttpClient();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    await repository.updateShowcase(created.json().id, {
      dependencies: [{
        path: '/api/profile', targetPath: '/api/profile', targetOrigin: 'https://example.com',
        originAlias: null, search: '', contentType: 'application/json', category: 'read_api',
        approved: true, redactedFields: ['/token'], contentHash: 'hash',
        discoveredAt: new Date().toISOString(),
      }],
    });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });
    http.nextHeaders = { 'content-type': 'application/json' };
    http.nextBody = 'not-json real-secret-token';

    const response = await app.inject({
      method: 'GET', url: '/api/profile', headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('real-secret-token');
    await app.close();
  });

  it('keeps the real cookie server-side and exposes only a session bridge cookie', async () => {
    const repository = new MemoryShowcaseRepository();
    const http = new RecordingHttpClient();
    const app = await buildApp({
      config: testConfig(), repository, policy: publicPolicy(), http,
      providers: [new CookiePasswordProvider()],
    });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({
      method: 'POST',
      url: '/api/showcases',
      headers,
      payload: {
        ...payload,
        authentication: {
          provider: 'password',
          config: {
            loginUrl: 'https://example.com/login',
            usernameSelector: '#email',
            passwordSelector: '#password',
            submitSelector: 'button[type=submit]',
            verification: { type: 'expected_selector', selector: '[data-user-menu]' },
            sessionToken: { storage: 'cookie', name: 'sid' },
          },
          secret: { username: 'demo@example.com', password: 'private-password' },
        },
      },
    });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });
    const page = await app.inject({
      method: 'GET',
      url: '/path',
      headers: { host: 'proxy-app.localhost:3000', cookie: 'sid=visitor-controlled' },
    });
    expect(page.statusCode).toBe(200);
    expect(http.attachedHeaders.at(-1)?.cookie).toBe('sid=real-cookie-value');
    expect(page.headers['set-cookie']).toMatch(/^sid=eyJ/);
    expect(page.headers['set-cookie']).not.toContain('real-cookie-value');
    expect(page.body).not.toContain('real-cookie-value');
    await app.close();
  });

  it('always derives upstream from stored configuration and keeps auth server-side', async () => {
    const http = new RecordingHttpClient();
    http.nextHeaders['x-private-origin'] = 'internal-api.example';
    const app = await buildApp({ config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/authenticate`, headers });
    const response = await app.inject({
      method: 'GET',
      url: '/path?url=http://127.0.0.1/admin',
      headers: {
        authorization: 'Bearer visitor-token', cookie: 'visitor=value', host: 'proxy-app.localhost:3000',
        origin: 'https://attacker.invalid', referer: 'https://attacker.invalid/page',
        'x-forwarded-host': 'internal.invalid',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(http.urls[0]!.origin).toBe('https://example.com');
    expect(http.urls[0]!.pathname).toBe('/base/path');
    expect(http.attachedHeaders[0]!.authorization).toBe('Bearer server-token');
    expect(http.attachedHeaders[0]!.cookie).toBeUndefined();
    expect(http.attachedHeaders[0]!.origin).toBeUndefined();
    expect(http.attachedHeaders[0]!.referer).toBeUndefined();
    expect(http.attachedHeaders[0]!['x-forwarded-host']).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['x-private-origin']).toBeUndefined();
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(response.body).toContain('href="/next"');
    expect(response.body).toContain('https://external.example/docs');
    expect(response.body).not.toContain('server-token');
    await app.close();
  });

  it('allows nested configured routes, preserves queries, and normalizes trailing slashes', async () => {
    const http = new RecordingHttpClient();
    const app = await buildApp({ config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });
    const response = await app.inject({
      method: 'GET', url: '/path/nested/?filter=active', headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(response.statusCode).toBe(200);
    expect(http.urls[0]!.pathname).toBe('/base/path/nested');
    expect(http.urls[0]!.search).toBe('?filter=active');
    await app.close();
  });

  it('returns 404 for disallowed routes before making an upstream request', async () => {
    const http = new RecordingHttpClient();
    const app = await buildApp({ config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    const response = await app.inject({
      method: 'GET', url: '/admin', headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(response.statusCode).toBe(404);
    expect(http.urls).toHaveLength(0);
    await app.close();
  });

  it('proxies only approved hidden dependencies using their captured target path and query', async () => {
    const repository = new MemoryShowcaseRepository();
    const http = new RecordingHttpClient();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    await repository.updateShowcase(created.json().id, {
      dependencies: [{
        path: '/assets/app.js',
        targetPath: '/assets/app.js',
        search: '?v=123',
        contentType: 'application/javascript',
        category: 'script',
        approved: true,
        contentHash: 'hash',
        discoveredAt: new Date().toISOString(),
      }],
    });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });

    const allowed = await app.inject({
      method: 'GET',
      url: '/assets/app.js?v=123',
      headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(allowed.statusCode).toBe(200);
    expect(http.urls.at(-1)?.pathname).toBe('/assets/app.js');
    expect(http.urls.at(-1)?.search).toBe('?v=123');
    const requestCount = http.urls.length;
    expect((await app.inject({
      method: 'GET',
      url: '/assets/app.js?v=other',
      headers: { host: 'proxy-app.localhost:3000' },
    })).statusCode).toBe(404);
    expect(http.urls).toHaveLength(requestCount);
    await app.close();
  });

  it('decodes compressed target content before rewriting and removes stale encoding headers', async () => {
    const http = new RecordingHttpClient();
    http.nextBody = gzipSync(Buffer.from('.hero{background:url("/images/hero.png")}'));
    http.nextHeaders = {
      'content-type': 'text/css',
      'content-encoding': 'gzip',
      etag: 'upstream-compressed-hash',
    };
    const app = await buildApp({
      config: testConfig(),
      repository: new MemoryShowcaseRepository(),
      policy: publicPolicy(),
      http,
    });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });

    const response = await app.inject({
      method: 'GET', url: '/path', headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.headers.etag).toBeUndefined();
    expect(response.body).toContain('/images/hero.png');
    await app.close();
  });

  it('bridges localStorage auth without exposing the captured token to visitors', async () => {
    const repository = new MemoryShowcaseRepository();
    const http = new RecordingHttpClient();
    const bridgePayload = {
      ...payload,
      authentication: {
        provider: 'password',
        config: {
          loginUrl: 'https://example.com/login',
          usernameSelector: '#email',
          passwordSelector: '#password',
          submitSelector: 'button[type=submit]',
          verification: { type: 'expected_selector', selector: '[data-user-menu]' },
          sessionToken: {
            storage: 'localStorage',
            name: 'access_token',
          },
        },
        secret: { username: 'demo@example.com', password: 'private-password' },
      },
    };
    const app = await buildApp({
      config: testConfig(),
      repository,
      policy: publicPolicy(),
      http,
      providers: [new StoragePasswordProvider()],
    });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload: bridgePayload });
    await repository.updateShowcase(created.json().id, {
      dependencies: [{
        path: '/api/session', targetPath: '/api/session', search: '',
        contentType: 'application/json', category: 'read_api', approved: true,
        sessionHeaders: ['x-renisa-session'],
        contentHash: 'session-hash', discoveredAt: new Date().toISOString(),
      }],
    });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/authenticate`, headers });

    const page = await app.inject({
      method: 'GET', url: '/path', headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('const bridgeKey = "access_token"');
    expect(page.body).not.toContain('real-access-token');
    const aggregate = await repository.getShowcaseById(created.json().id);
    const bridgeToken = new SessionBridge(TEST_KEY).token(aggregate!);

    http.nextHeaders = { 'content-type': 'application/json' };
    http.nextBody = '{"authenticated":true}';
    const api = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: {
        host: 'proxy-app.localhost:3000',
        'x-renisa-session': `Token ${bridgeToken}:v1`,
        'x-unapproved-session': bridgeToken,
      },
    });
    expect(api.statusCode).toBe(200);
    expect(http.attachedHeaders.at(-1)?.['x-renisa-session']).toBe('Token real-access-token:v1');
    expect(http.attachedHeaders.at(-1)?.['x-unapproved-session']).toBeUndefined();
    expect(api.body).not.toContain('real-access-token');

    const requestCount = http.urls.length;
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/session',
      headers: {
        host: 'proxy-app.localhost:3000',
        'access-control-request-headers': 'x-renisa-session',
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-headers']).toContain('x-renisa-session');
    expect(http.urls).toHaveLength(requestCount);
    await app.close();
  });

  it('bridges a configured sessionStorage token without exposing its value', async () => {
    const repository = new MemoryShowcaseRepository();
    const http = new RecordingHttpClient();
    const app = await buildApp({
      config: testConfig(),
      repository,
      policy: publicPolicy(),
      http,
      providers: [new SessionStoragePasswordProvider()],
    });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({
      method: 'POST',
      url: '/api/showcases',
      headers,
      payload: {
        ...payload,
        authentication: {
          provider: 'password',
          config: {
            loginUrl: 'https://example.com/login',
            usernameSelector: '#email',
            passwordSelector: '#password',
            submitSelector: 'button[type=submit]',
            verification: { type: 'expected_selector', selector: '[data-user-menu]' },
            sessionToken: { storage: 'sessionStorage', name: 'session_token' },
          },
          secret: { username: 'demo@example.com', password: 'private-password' },
        },
      },
    });
    await repository.updateShowcase(created.json().id, {
      dependencies: [{
        path: '/api/session', targetPath: '/api/session', search: '',
        contentType: 'application/json', category: 'read_api', approved: true,
        sessionHeaders: ['x-session-token'],
        contentHash: 'session-storage-hash', discoveredAt: new Date().toISOString(),
      }],
    });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/authenticate`, headers });

    const page = await app.inject({
      method: 'GET', url: '/path', headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('const bridgeStorage = "sessionStorage"');
    expect(page.body).not.toContain('real-session-storage-token');
    const aggregate = await repository.getShowcaseById(created.json().id);
    const bridgeToken = new SessionBridge(TEST_KEY).token(aggregate!);

    http.nextHeaders = { 'content-type': 'application/json' };
    http.nextBody = '{"authenticated":true}';
    const api = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: {
        host: 'proxy-app.localhost:3000',
        'x-session-token': bridgeToken,
      },
    });
    expect(api.statusCode).toBe(200);
    expect(http.attachedHeaders.at(-1)?.['x-session-token']).toBe('real-session-storage-token');
    expect(api.body).not.toContain('real-session-storage-token');
    await app.close();
  });

  it('rejects mutation methods at the read-only boundary', async () => {
    const http = new RecordingHttpClient();
    const app = await buildApp({ config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    const response = await app.inject({
      method: 'POST', url: '/path', headers: { host: 'proxy-app.localhost:3000' }, payload: { destructive: true },
    });
    expect(response.statusCode).toBe(405);
    expect(response.json().error.code).toBe('UNSUPPORTED_APPLICATION');
    expect(http.urls).toHaveLength(0);
    await app.close();
  });

  it('propagates safe upstream response status codes', async () => {
    const http = new RecordingHttpClient();
    const app = await buildApp({ config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });
    http.nextStatus = 418;
    const response = await app.inject({
      method: 'GET', url: '/path', headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(response.statusCode).toBe(418);
    await app.close();
  });

  it('expires the session on an upstream 401', async () => {
    const repository = new MemoryShowcaseRepository();
    const http = new RecordingHttpClient();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/authenticate`, headers });
    http.nextStatus = 401;
    const response = await app.inject({
      method: 'GET', url: '/path', headers: { host: 'proxy-app.localhost:3000' },
    });
    expect(response.statusCode).toBe(401);
    const stored = await repository.getShowcaseById(created.json().id);
    expect(stored?.showcase.state).toBe('AUTHENTICATION_EXPIRED');
    expect(stored?.session).toBeNull();
    await app.close();
  });
});
