import { describe, expect, it } from 'vitest';
import type {
  AuthenticationRuntimeInput,
  RemoteBrowserInput,
  RemoteBrowserRuntime,
  ViewerRuntimeInput,
} from '../src/browser/remote-browser-runtime.js';
import { AppError } from '../src/errors.js';
import { buildApp } from '../src/api/app.js';
import { MemoryShowcaseRepository } from '../src/storage/memory-repository.js';
import { authenticatedHeaders, publicPolicy, testConfig } from './helpers.js';

const sessionId = 'runtime_session_1234567890';
const sessionToken = 'runtime-token-1234567890-abcdef';

class FixedRemoteBrowserRuntime implements RemoteBrowserRuntime {
  viewerInput?: ViewerRuntimeInput;
  authenticationInput?: AuthenticationRuntimeInput;
  inputs: RemoteBrowserInput[] = [];
  navigatedPath?: string;
  capturedShowcaseId?: string;
  closedSessions: string[] = [];
  closed = false;

  async startViewer(input: ViewerRuntimeInput) {
    this.viewerInput = input;
    return { id: sessionId, token: sessionToken, viewport: input.viewport, currentPath: input.initialPath };
  }

  async startAuthentication(input: AuthenticationRuntimeInput) {
    this.authenticationInput = input;
    return { id: sessionId, token: sessionToken, viewport: input.viewport, currentPath: '/login' };
  }

  async frame(id: string, token: string) {
    this.assertSession(id, token);
    return { body: Buffer.from('jpeg-frame'), currentPath: '/dashboard', blockedRequests: 2 };
  }

  async input(id: string, token: string, input: RemoteBrowserInput) {
    this.assertSession(id, token);
    this.inputs.push(input);
  }

  async navigate(id: string, token: string, path: string) {
    this.assertSession(id, token);
    this.navigatedPath = path;
    return path;
  }

  async captureAuthentication(id: string, token: string, showcaseId: string) {
    this.assertSession(id, token);
    this.capturedShowcaseId = showcaseId;
    return {
      cookies: [{
        name: 'session', value: 'server-only-cookie', domain: 'example.com', path: '/',
        expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' as const,
      }],
      origins: [],
    };
  }

  async closeSession(id: string, token: string) {
    this.assertSession(id, token);
    this.closedSessions.push(id);
  }

  async closeShowcase() {}

  async close() {
    this.closed = true;
  }

  private assertSession(id: string, token: string) {
    if (id !== sessionId || token !== sessionToken) {
      throw new AppError('NOT_FOUND', 'Remote browser session not found', 404);
    }
  }
}

const payload = {
  name: 'Remote Demo',
  slug: 'remote-demo',
  targetUrl: 'https://example.com/app',
  mode: 'selected_routes',
  routes: [{ path: '/dashboard', title: 'Dashboard', description: 'Main dashboard' }],
  authentication: {
    provider: 'token',
    config: { headerName: 'authorization', prefix: 'Bearer ' },
    secret: { token: 'server-only-token' },
  },
};

describe('remote browser API', () => {
  it('closes the retired wildcard preview surface when legacy proxying is disabled', async () => {
    const runtime = new FixedRemoteBrowserRuntime();
    const app = await buildApp({
      config: testConfig({ SHOWCASE_LEGACY_PATH_PROXY: 'false' }),
      repository: new MemoryShowcaseRepository(),
      policy: publicPolicy(),
      remoteBrowserRuntime: runtime,
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/providers',
      headers: { host: 'retired-preview.localhost:3000' },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('starts a viewer, returns frames, forwards input, and navigates configured routes', async () => {
    const runtime = new FixedRemoteBrowserRuntime();
    const app = await buildApp({
      config: testConfig(),
      repository: new MemoryShowcaseRepository(),
      policy: publicPolicy(),
      remoteBrowserRuntime: runtime,
    });
    const headers = await authenticatedHeaders(app);
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload });
    await app.inject({ method: 'POST', url: `/api/showcases/${created.json().id}/prepare`, headers });

    const started = await app.inject({
      method: 'POST',
      url: '/api/showcases/remote-demo/remote-browser',
      payload: { path: '/dashboard', viewport: { width: 1440, height: 900 } },
    });
    expect(started.statusCode).toBe(201);
    expect(started.json()).toMatchObject({ id: sessionId, token: sessionToken });
    expect(runtime.viewerInput).toMatchObject({ initialPath: '/dashboard', showcaseId: created.json().id });
    expect(JSON.stringify(runtime.viewerInput)).toContain('server-only-token');

    const runtimeHeaders = { 'x-showrun-runtime-token': sessionToken };
    const frame = await app.inject({
      method: 'GET', url: `/api/remote-browser/${sessionId}/frame`, headers: runtimeHeaders,
    });
    expect(frame.statusCode).toBe(200);
    expect(frame.headers['content-type']).toContain('image/jpeg');
    expect(frame.headers['x-showrun-current-path']).toBe('%2Fdashboard');
    expect(frame.headers['x-showrun-blocked-requests']).toBe('2');

    const input = await app.inject({
      method: 'POST',
      url: `/api/remote-browser/${sessionId}/input`,
      headers: runtimeHeaders,
      payload: { type: 'click', x: 100, y: 200, button: 'left', clickCount: 1 },
    });
    expect(input.statusCode).toBe(204);
    expect(runtime.inputs).toEqual([{ type: 'click', x: 100, y: 200, button: 'left', clickCount: 1 }]);

    const navigated = await app.inject({
      method: 'POST',
      url: `/api/remote-browser/${sessionId}/navigate`,
      headers: runtimeHeaders,
      payload: { path: '/dashboard' },
    });
    expect(navigated.json()).toEqual({ path: '/dashboard' });
    expect(runtime.navigatedPath).toBe('/dashboard');
    await app.close();
    expect(runtime.closed).toBe(true);
  });

  it('captures an owner-driven browser login without selectors or bearer-token configuration', async () => {
    const runtime = new FixedRemoteBrowserRuntime();
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({
      config: testConfig(), repository, policy: publicPolicy(), remoteBrowserRuntime: runtime,
    });
    const headers = await authenticatedHeaders(app);
    const { authentication: _authentication, ...withoutAuthentication } = payload;
    const created = await app.inject({
      method: 'POST', url: '/api/showcases', headers, payload: withoutAuthentication,
    });

    const started = await app.inject({
      method: 'POST',
      url: `/api/showcases/${created.json().id}/auth-browser`,
      headers,
      payload: { initialUrl: 'https://example.com/login', viewport: { width: 1440, height: 900 } },
    });
    expect(started.statusCode).toBe(200);
    expect(runtime.authenticationInput).toMatchObject({ initialUrl: 'https://example.com/login' });

    const captured = await app.inject({
      method: 'POST',
      url: `/api/showcases/${created.json().id}/auth-browser/${sessionId}/capture`,
      headers: { ...headers, 'x-showrun-runtime-token': sessionToken },
    });
    expect(captured.statusCode).toBe(200);
    expect(captured.json()).toMatchObject({ state: 'ACTIVE', authenticationConfigured: true });
    expect(captured.body).not.toContain('server-only-cookie');
    expect(runtime.capturedShowcaseId).toBe(created.json().id);
    expect(runtime.closedSessions).toEqual([sessionId]);

    const status = await app.inject({ method: 'GET', url: '/api/showcases/remote-demo/status' });
    expect(status.json().status).toBe('ready');
    await app.close();
  });

  it('requires the runtime capability token and creator ownership for sensitive operations', async () => {
    const runtime = new FixedRemoteBrowserRuntime();
    const app = await buildApp({
      config: testConfig(), repository: new MemoryShowcaseRepository(), policy: publicPolicy(),
      remoteBrowserRuntime: runtime,
    });
    const headers = await authenticatedHeaders(app);
    const { authentication: _authentication, ...withoutAuthentication } = payload;
    const created = await app.inject({ method: 'POST', url: '/api/showcases', headers, payload: withoutAuthentication });

    expect((await app.inject({
      method: 'GET', url: `/api/remote-browser/${sessionId}/frame`,
    })).statusCode).toBe(404);
    expect((await app.inject({
      method: 'POST',
      url: `/api/showcases/${created.json().id}/auth-browser/${sessionId}/capture`,
      headers: { 'x-showrun-runtime-token': sessionToken },
    })).statusCode).toBe(401);
    await app.close();
  });
});
