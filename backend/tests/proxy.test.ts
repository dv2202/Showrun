import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { buildApp } from '../src/api/app.js';
import type { AuthenticationProvider } from '../src/auth/providers.js';
import { PUBLIC_SESSION_PLACEHOLDER } from '../src/proxy/content-rewriter.js';
import { SecureHttpClient, type SecureHttpRequest, type SecureHttpResponse } from '../src/proxy/secure-http-client.js';
import { MemoryShowcaseRepository } from '../src/storage/memory-repository.js';
import { authenticatedHeaders, publicPolicy, testConfig } from './helpers.js';

class RecordingHttpClient extends SecureHttpClient {
  urls: URL[] = [];
  attachedHeaders: Array<Record<string, string | string[] | undefined>> = [];
  nextStatus = 200;
  nextBody: string | Buffer = '<a href="/next">Next</a><a href="https://external.example/docs">External</a>';
  nextHeaders: Record<string, string> = {
    'content-type': 'text/html',
    'set-cookie': 'upstream-secret=value',
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

describe('secure proxy behavior', () => {
  it('always derives upstream from stored configuration and keeps auth server-side', async () => {
    const http = new RecordingHttpClient();
    const app = await buildApp({ config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/authenticate`, headers });
    const response = await app.inject({
      method: 'GET',
      url: '/showcase/proxy-app/path?url=http://127.0.0.1/admin',
      headers: {
        authorization: 'Bearer visitor-token', cookie: 'visitor=value', host: 'attacker.invalid',
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
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(response.body).toContain('/backend-showcase/proxy-app/next');
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
    const response = await app.inject({ method: 'GET', url: '/showcase/proxy-app/path/nested/?filter=active' });
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
    const response = await app.inject({ method: 'GET', url: '/showcase/proxy-app/admin' });
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
      url: '/showcase/proxy-app/assets/app.js?v=123',
    });
    expect(allowed.statusCode).toBe(200);
    expect(http.urls.at(-1)?.pathname).toBe('/assets/app.js');
    expect(http.urls.at(-1)?.search).toBe('?v=123');
    const requestCount = http.urls.length;
    expect((await app.inject({
      method: 'GET',
      url: '/showcase/proxy-app/assets/app.js?v=other',
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

    const response = await app.inject({ method: 'GET', url: '/showcase/proxy-app/path' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.headers.etag).toBeUndefined();
    expect(response.body).toContain('/backend-showcase/proxy-app/images/hero.png');
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
        contentHash: 'session-hash', discoveredAt: new Date().toISOString(),
      }],
    });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/authenticate`, headers });

    const page = await app.inject({ method: 'GET', url: '/showcase/proxy-app/path' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('const bridgeKey = "access_token"');
    expect(page.body).not.toContain('real-access-token');

    http.nextHeaders = { 'content-type': 'application/json' };
    http.nextBody = '{"authenticated":true}';
    const api = await app.inject({
      method: 'GET',
      url: '/showcase/proxy-app/api/session',
      headers: { 'x-renisa-session': `Token ${PUBLIC_SESSION_PLACEHOLDER}:v1` },
    });
    expect(api.statusCode).toBe(200);
    expect(http.attachedHeaders.at(-1)?.['x-renisa-session']).toBe('Token real-access-token:v1');
    expect(api.body).not.toContain('real-access-token');

    const requestCount = http.urls.length;
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/showcase/proxy-app/api/session',
      headers: { 'access-control-request-headers': 'x-renisa-session' },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-headers']).toContain('x-renisa-session');
    expect(http.urls).toHaveLength(requestCount);
    await app.close();
  });

  it('rejects mutation methods at the read-only boundary', async () => {
    const http = new RecordingHttpClient();
    const app = await buildApp({ config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy(), http });
    const headers = await authenticatedHeaders(app);
    await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    const response = await app.inject({ method: 'POST', url: '/showcase/proxy-app/path', payload: { destructive: true } });
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
    const response = await app.inject({ method: 'GET', url: '/showcase/proxy-app/path' });
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
    const response = await app.inject({ method: 'GET', url: '/showcase/proxy-app/path' });
    expect(response.statusCode).toBe(401);
    const stored = await repository.getShowcaseById(created.json().id);
    expect(stored?.showcase.state).toBe('AUTHENTICATION_EXPIRED');
    expect(stored?.session).toBeNull();
    await app.close();
  });
});
