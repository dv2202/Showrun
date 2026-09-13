import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/api/app.js';
import { SecureHttpClient, type SecureHttpRequest, type SecureHttpResponse } from '../src/proxy/secure-http-client.js';
import { MemoryShowcaseRepository } from '../src/storage/memory-repository.js';
import { authenticatedHeaders, publicPolicy, testConfig } from './helpers.js';

class RecordingHttpClient extends SecureHttpClient {
  urls: URL[] = [];
  attachedHeaders: Array<Record<string, string | string[] | undefined>> = [];
  nextStatus = 200;
  nextBody = '<a href="/next">Next</a><a href="https://external.example/docs">External</a>';

  constructor() {
    super(publicPolicy(), 1000, 100_000);
  }

  override async fetch(input: string | URL, options: SecureHttpRequest = {}): Promise<SecureHttpResponse> {
    const url = new URL(input);
    this.urls.push(url);
    this.attachedHeaders.push(options.headersForUrl?.(url, 0) ?? options.headers ?? {});
    return {
      status: this.nextStatus,
      headers: { 'content-type': 'text/html', 'set-cookie': 'upstream-secret=value' },
      body: Buffer.from(this.nextBody),
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
