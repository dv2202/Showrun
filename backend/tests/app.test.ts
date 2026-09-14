import { describe, expect, it } from 'vitest';
import type { AuthenticationProvider } from '../src/auth/providers.js';
import type { CompatibilityChecker, DependencyScanner } from '../src/browser/playwright-bootstrapper.js';
import { buildApp } from '../src/api/app.js';
import { AppError } from '../src/errors.js';
import { MemoryShowcaseRepository } from '../src/storage/memory-repository.js';
import { authenticatedHeaders, publicPolicy, testConfig } from './helpers.js';

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

class CandidatePasswordProvider implements AuthenticationProvider {
  readonly kind = 'password' as const;
  async authenticate() {
    return {
      origins: [{
        origin: 'https://example.com',
        localStorage: [{ name: 'access_token', value: 'real-browser-token' }],
      }],
      sessionCandidates: [{
        storage: 'localStorage' as const,
        name: 'access_token',
        confidence: 'high' as const,
        requestHeaders: ['authorization'],
      }],
    };
  }
}

class FixedDependencyScanner implements DependencyScanner {
  async scan() {
    const discoveredAt = new Date().toISOString();
    return [
      {
        path: '/assets/app.js',
        targetPath: '/assets/app.js',
        search: '',
        contentType: 'application/javascript',
        category: 'script' as const,
        approved: true,
        contentHash: 'script-hash',
        discoveredAt,
      },
      {
        path: '/api/dashboard',
        targetPath: '/api/dashboard',
        search: '',
        contentType: 'application/json',
        category: 'read_api' as const,
        approved: false,
        contentHash: 'api-hash',
        discoveredAt,
      },
    ];
  }
}

class FixedCompatibilityChecker implements CompatibilityChecker {
  publicUrl = '';
  sensitiveValues: string[] = [];
  async check(publicUrl: string, routes: typeof createPayload.routes, sensitiveValues: string[]) {
    this.publicUrl = publicUrl;
    this.sensitiveValues = sensitiveValues;
    return {
      compatible: true,
      checkedAt: '2026-09-14T00:00:00.000Z',
      routes: routes.map((route) => ({
        path: route.path,
        status: 200,
        loaded: true,
        loginDetected: false,
        originIsolated: true,
        mutationsBlocked: true,
        secretsExposed: false,
        failedRequests: [],
        consoleErrors: [],
      })),
    };
  }
}

describe('showcase API and authentication lifecycle', () => {
  it('creates and lists a showcase without exposing secrets publicly', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy() });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload: createPayload });
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
      publicUrl: 'http://example-app.localhost:3000',
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
    expect((await app.inject({
      method: 'GET',
      url: '/api/showcases',
      headers: { authorization: 'Bearer obsolete-static-admin-token' },
    })).statusCode).toBe(401);
    await app.close();
  });

  it('generates a unique slug when one is not supplied', async () => {
    const app = await buildApp({ config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy() });
    const headers = await authenticatedHeaders(app);
    const { slug: _slug, ...payloadWithoutSlug } = createPayload;
    const first = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload: payloadWithoutSlug });
    const second = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload: payloadWithoutSlug });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().slug).toMatch(/^example-app-[a-f0-9]{8}$/);
    expect(second.json().slug).not.toBe(first.json().slug);
    await app.close();
  });

  it('updates a showcase mode and configured routes', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy() });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload: createPayload });
    const routes = [
      { path: '/reports', title: 'Reports', description: 'Reporting workspace' },
      { path: '/settings', title: 'Settings', description: 'Workspace settings' },
    ];

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/showcases/${created.json().id}`,
      headers,
      payload: { mode: 'full_application', routes },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ mode: 'full_application', routes });
    expect((await repository.getShowcaseById(created.json().id))?.showcase).toMatchObject({
      mode: 'full_application',
      routes,
    });
    await app.close();
  });

  it('updates password login mapping without returning or replacing saved credentials', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy() });
    const headers = await authenticatedHeaders(app);
    const passwordAuthentication = {
      provider: 'password',
      config: {
        loginUrl: 'https://example.com/login',
        usernameSelector: '#email',
        passwordSelector: '#password',
        submitSelector: 'button[type=submit]',
        verification: { type: 'expected_selector', selector: '[data-user-menu]' },
      },
      secret: { username: 'developer@example.com', password: 'private-password' },
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/showcases',
      headers,
      payload: { ...createPayload, authentication: passwordAuthentication },
    });
    const before = await repository.getShowcaseById(created.json().id);
    const updatedConfig = {
      ...passwordAuthentication.config,
      submitSelector: '[data-testid=login-submit]',
    };

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/showcases/${created.json().id}`,
      headers,
      payload: {
        authentication: { provider: 'password', config: updatedConfig },
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      authenticationProvider: 'password',
      authenticationConfig: updatedConfig,
    });
    expect(updated.body).not.toContain('developer@example.com');
    expect(updated.body).not.toContain('private-password');
    const after = await repository.getShowcaseById(created.json().id);
    expect(after?.authentication?.config).toEqual(updatedConfig);
    expect(after?.authentication?.encryptedSecret).toBe(before?.authentication?.encryptedSecret);
    await app.close();
  });

  it('scans dependencies as the creator and requires explicit approval for read APIs', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({
      config: testConfig(),
      repository,
      policy: publicPolicy(),
      dependencyScanner: new FixedDependencyScanner(),
    });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({
      method: 'POST',
      url: '/api/showcases',
      headers,
      payload: createPayload,
    });

    const scanned = await app.inject({
      method: 'POST',
      url: `/api/showcases/${created.json().id}/scan-dependencies`,
      headers,
    });
    expect(scanned.statusCode).toBe(200);
    expect(scanned.json().dependencies).toMatchObject([
      { path: '/assets/app.js', category: 'script', approved: true },
      { path: '/api/dashboard', category: 'read_api', approved: false },
    ]);

    const approved = await app.inject({
      method: 'PATCH',
      url: `/api/showcases/${created.json().id}/dependencies`,
      headers,
      payload: { approvals: [{ path: '/api/dashboard', search: '', approved: true }] },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().dependencies[1]).toMatchObject({
      path: '/api/dashboard',
      approved: true,
    });
    const rescanned = await app.inject({
      method: 'POST',
      url: `/api/showcases/${created.json().id}/scan-dependencies`,
      headers,
    });
    expect(rescanned.json().dependencies[1]).toMatchObject({
      path: '/api/dashboard',
      approved: true,
    });
    await app.close();
  });

  it('supports creator preparation and deletion', async () => {
    const app = await buildApp({ config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy() });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload: createPayload });
    const prepared = await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });
    expect(prepared.statusCode).toBe(200);
    expect(prepared.json().state).toBe('ACTIVE');
    const deleted = await app.inject({ method: 'DELETE', url: `/api/showcases/${created.json().id}`, headers });
    expect(deleted.statusCode).toBe(204);
    const missing = await app.inject({ method: 'GET', url: `/api/showcases/${created.json().id}`, headers });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('runs compatibility checks against the derived preview origin without returning secrets', async () => {
    const checker = new FixedCompatibilityChecker();
    const app = await buildApp({
      config: testConfig(),
      repository: new MemoryShowcaseRepository(),
      policy: publicPolicy(),
      compatibilityChecker: checker,
    });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload: createPayload });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });
    const response = await app.inject({
      method: 'POST', url: `/api/showcases/${created.json().id}/compatibility-test`, headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().compatible).toBe(true);
    expect(response.body).not.toContain('never-return-this-token');
    expect(checker.publicUrl).toBe('http://example-app.localhost:3000');
    expect(checker.sensitiveValues).toContain('Bearer never-return-this-token');
    await app.close();
  });

  it('returns only sanitized session detection metadata to the creator', async () => {
    const app = await buildApp({
      config: testConfig(),
      repository: new MemoryShowcaseRepository(),
      policy: publicPolicy(),
      providers: [new CandidatePasswordProvider()],
    });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({
      method: 'POST',
      url: '/api/showcases',
      headers,
      payload: {
        ...createPayload,
        authentication: {
          provider: 'password',
          config: {
            loginUrl: 'https://example.com/login',
            usernameSelector: '#email',
            passwordSelector: '#password',
            submitSelector: 'button[type=submit]',
            verification: { type: 'expected_selector', selector: '[data-user-menu]' },
            sessionToken: { storage: 'localStorage', name: 'access_token' },
          },
          secret: { username: 'demo@example.com', password: 'private-password' },
        },
      },
    });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });
    const response = await app.inject({
      method: 'GET', url: `/api/showcases/${created.json().id}/session-diagnostics`, headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      active: true,
      candidates: [{
        storage: 'localStorage',
        name: 'access_token',
        confidence: 'high',
        requestHeaders: ['authorization'],
        selected: true,
      }],
    });
    expect(response.body).not.toContain('real-browser-token');
    expect(response.body).not.toContain('private-password');
    await app.close();
  });

  it('rejects credentials placed in plaintext authentication config', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy() });
    const headers = await authenticatedHeaders(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/showcases',
      headers,
      payload: {
        ...createPayload,
        authentication: {
          ...createPayload.authentication,
          config: { ...createPayload.authentication.config, token: 'plaintext-token' },
        },
      },
    });
    expect(response.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/showcases', headers })).json()).toHaveLength(0);
    await app.close();
  });

  it('accepts top-level username/password shorthand but persists them only as ciphertext', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy() });
    const headers = await authenticatedHeaders(app);
    const { authentication: _authentication, ...base } = createPayload;
    const response = await app.inject({
      method: 'POST', url: '/api/showcases', headers,
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
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload: createPayload });

    const responses = await Promise.all(Array.from({ length: 50 }, () =>
      app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers })));
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    expect(provider.calls).toBe(1);
    expect(responses[0]!.json().state).toBe('ACTIVE');
    await app.close();
  });

  it('automatically starts one preparation when concurrent visitors open an allowed route', async () => {
    const provider = new DelayedTokenProvider();
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy(), providers: [provider] });
    const headers = await authenticatedHeaders(app);
    await app.inject({ method: 'POST', url: '/api/showcases', headers, payload: createPayload });
    const responses = await Promise.all(Array.from({ length: 50 }, () =>
      app.inject({
        method: 'GET', url: '/projects', headers: { host: 'example-app.localhost:3000' },
      })));
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
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload: createPayload });
    const auth = await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/authenticate`, headers });
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
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({
      method: 'POST', url: '/api/showcases', headers,
      payload: {
        ...createPayload,
        authentication: {
          ...createPayload.authentication,
          secret: { token: 'valid-prefix\r\nX-Injected: yes' },
        },
      },
    });
    const prepared = await app.inject({
      method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers,
    });
    expect(prepared.statusCode).toBe(422);
    expect(prepared.body).not.toContain('X-Injected');
    expect((await repository.getShowcaseById(created.json().id))?.session).toBeNull();
    await app.close();
  });

  it('marks an expired stored session as AUTHENTICATION_EXPIRED', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy() });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload: createPayload });
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
