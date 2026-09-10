import { describe, expect, it } from 'vitest';
import type { AuthenticationProvider } from '../src/auth/providers.js';
import { buildApp } from '../src/api/app.js';
import { AppError } from '../src/errors.js';
import { MemoryShowcaseRepository } from '../src/storage/memory-repository.js';
import { adminHeaders, publicPolicy, testConfig } from './helpers.js';

const createPayload = {
  name: 'Example App',
  slug: 'example-app',
  targetUrl: 'https://example.com/app',
  mode: 'selected_routes',
  routes: [
    { path: '/dashboard', title: 'Dashboard', description: 'Main dashboard' },
    { path: '/projects', title: 'Projects', description: 'Project list' },
  ],
  authentication: {
    provider: 'token',
    config: { headerName: 'authorization', prefix: 'Bearer ' },
    secret: { token: 'never-return-this-token' },
  },
};

class DelayedTokenProvider implements AuthenticationProvider {
  readonly kind = 'token' as const;
  calls = 0;
  constructor(private readonly fail = false) {}
  async authenticate() {
    this.calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (this.fail) throw new AppError('AUTHENTICATION_FAILED', 'Authentication failed', 422);
    return { headers: { authorization: 'Bearer server-only' } };
  }
}

describe('showcase API and authentication lifecycle', () => {
  it('creates and lists a showcase without exposing secrets publicly', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy() });
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers: adminHeaders, payload: createPayload });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain('never-return-this-token');
    const body = created.json();
    expect(body).toMatchObject({ slug: 'example-app', state: 'CREATED', authenticationConfigured: true });

    const stored = await repository.getShowcaseById(body.id);
    expect(stored?.authentication?.encryptedSecret).not.toContain('never-return-this-token');

    const status = await app.inject({ method: 'GET', url: '/api/showcases/example-app/status' });
    expect(status.json()).toEqual({
      name: 'Example App',
      slug: 'example-app',
      status: 'auth_required',
      mode: 'selected_routes',
      routes: createPayload.routes,
    });
    expect(status.body).not.toContain('example.com');
    expect(status.body).not.toContain('token');
    await app.close();
  });

  it('requires creator authentication for management endpoints', async () => {
    const app = await buildApp({ config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy() });
    expect((await app.inject({ method: 'GET', url: '/api/showcases' })).statusCode).toBe(401);
    await app.close();
  });

  it('generates a unique slug when one is not supplied', async () => {
    const app = await buildApp({ config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy() });
    const { slug: _slug, ...payloadWithoutSlug } = createPayload;
    const first = await app.inject({ method: 'POST', url: '/api/showcases', headers: adminHeaders, payload: payloadWithoutSlug });
    const second = await app.inject({ method: 'POST', url: '/api/showcases', headers: adminHeaders, payload: payloadWithoutSlug });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().slug).toMatch(/^example-app-[a-f0-9]{8}$/);
    expect(second.json().slug).not.toBe(first.json().slug);
    await app.close();
  });

  it('supports creator preparation and deletion', async () => {
    const app = await buildApp({ config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy() });
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers: adminHeaders, payload: createPayload });
    const prepared = await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers: adminHeaders });
    expect(prepared.statusCode).toBe(200);
    expect(prepared.json().state).toBe('ACTIVE');
    const deleted = await app.inject({ method: 'DELETE', url: `/api/showcases/${created.json().id}`, headers: adminHeaders });
    expect(deleted.statusCode).toBe(204);
    const missing = await app.inject({ method: 'GET', url: `/api/showcases/${created.json().id}`, headers: adminHeaders });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('rejects credentials placed in plaintext authentication config', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy() });
    const response = await app.inject({
      method: 'POST',
      url: '/api/showcases',
      headers: adminHeaders,
      payload: {
        ...createPayload,
        authentication: {
          ...createPayload.authentication,
          config: { ...createPayload.authentication.config, token: 'plaintext-token' },
        },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(await repository.listShowcases(testConfig().DEFAULT_USER_ID)).toHaveLength(0);
    await app.close();
  });

  it('accepts top-level username/password shorthand but persists them only as ciphertext', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy() });
    const { authentication: _authentication, ...base } = createPayload;
    const response = await app.inject({
      method: 'POST', url: '/api/showcases', headers: adminHeaders,
      payload: {
        ...base,
        username: 'developer@example.com',
        password: 'plaintext-request-password',
        login: {
          loginUrl: 'https://example.com/login',
          usernameSelector: '#email',
          passwordSelector: '#password',
          submitSelector: 'button[type=submit]',
          verification: { type: 'expected_selector', selector: '[data-user-menu]' },
        },
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain('developer@example.com');
    expect(response.body).not.toContain('plaintext-request-password');
    const stored = await repository.getShowcaseById(response.json().id);
    expect(stored?.authentication?.provider).toBe('password');
    expect(stored?.authentication?.config).not.toHaveProperty('username');
    expect(stored?.authentication?.config).not.toHaveProperty('password');
    expect(stored?.authentication?.encryptedSecret).not.toContain('plaintext-request-password');
    await app.close();
  });

  it('deduplicates concurrent preparation and activates one session', async () => {
    const provider = new DelayedTokenProvider();
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy(), providers: [provider] });
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers: adminHeaders, payload: createPayload });

    const responses = await Promise.all(Array.from({ length: 50 }, () =>
      app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers: adminHeaders })));
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    expect(provider.calls).toBe(1);
    expect(responses[0]!.json().state).toBe('ACTIVE');
    await app.close();
  });

  it('automatically starts one preparation when concurrent visitors open an allowed route', async () => {
    const provider = new DelayedTokenProvider();
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy(), providers: [provider] });
    await app.inject({ method: 'POST', url: '/api/showcases', headers: adminHeaders, payload: createPayload });
    const responses = await Promise.all(Array.from({ length: 50 }, () =>
      app.inject({ method: 'GET', url: '/showcase/example-app/projects' })));
    expect(responses.every((response) => response.statusCode === 202)).toBe(true);
    expect(responses.every((response) => response.json().status === 'preparing')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(provider.calls).toBe(1);
    const status = await app.inject({ method: 'GET', url: '/api/showcases/example-app/status' });
    expect(status.json().status).toBe('ready');
    await app.close();
  });

  it('transitions to ERROR on authentication failure without leaking details', async () => {
    const provider = new DelayedTokenProvider(true);
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy(), providers: [provider] });
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers: adminHeaders, payload: createPayload });
    const auth = await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/authenticate`, headers: adminHeaders });
    expect(auth.statusCode).toBe(422);
    expect(auth.json()).toEqual({ error: { code: 'AUTHENTICATION_FAILED', message: 'Authentication failed' } });
    const stored = await repository.getShowcaseById(created.json().id);
    expect(stored?.showcase.state).toBe('ERROR');
    expect(stored?.session).toBeNull();
    await app.close();
  });

  it('rejects newline injection in server-side authentication headers', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy() });
    const created = await app.inject({
      method: 'POST', url: '/api/showcases', headers: adminHeaders,
      payload: {
        ...createPayload,
        authentication: {
          ...createPayload.authentication,
          secret: { token: 'valid-prefix\r\nX-Injected: yes' },
        },
      },
    });
    const prepared = await app.inject({
      method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers: adminHeaders,
    });
    expect(prepared.statusCode).toBe(422);
    expect(prepared.body).not.toContain('X-Injected');
    expect((await repository.getShowcaseById(created.json().id))?.session).toBeNull();
    await app.close();
  });

  it('marks an expired stored session as AUTHENTICATION_EXPIRED', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy() });
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers: adminHeaders, payload: createPayload });
    await repository.saveSession(created.json().id, 'not-read-after-expiry', new Date(Date.now() - 1000));
    await repository.updateShowcase(created.json().id, { state: 'ACTIVE' });
    const status = await app.inject({ method: 'GET', url: '/api/showcases/example-app/status' });
    expect(status.json().status).toBe('auth_required');
    const stored = await repository.getShowcaseById(created.json().id);
    expect(stored?.showcase.state).toBe('AUTHENTICATION_EXPIRED');
    expect(stored?.session).toBeNull();
    await app.close();
  });
});
