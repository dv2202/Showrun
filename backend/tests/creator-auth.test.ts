import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/api/app.js';
import { MemoryShowcaseRepository } from '../src/storage/memory-repository.js';
import { publicPolicy, testConfig } from './helpers.js';

function sessionCookie(value: string | string[] | undefined): string {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) throw new Error('Expected a session cookie');
  return header.split(';')[0]!;
}

const showcasePayload = {
  name: 'Private Console',
  targetUrl: 'https://example.com',
  mode: 'selected_routes',
  routes: [{ path: '/dashboard', title: 'Dashboard', description: 'Main view' }],
};

describe('creator authentication', () => {
  it('registers with email, stores a password hash, and creates an opaque session', async () => {
    const repository = new MemoryShowcaseRepository();
    const app = await buildApp({ config: testConfig(), repository, policy: publicPolicy() });

    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/email/register',
      payload: { name: 'Devansh Shah', email: 'Devansh@Example.com', password: 'very-secure-password' },
    });
    expect(registered.statusCode).toBe(201);
    expect(registered.json().user).toMatchObject({
      name: 'Devansh Shah',
      email: 'devansh@example.com',
    });
    expect(registered.body).not.toContain('very-secure-password');
    const stored = await repository.findUserByEmail('devansh@example.com');
    expect(stored?.passwordHash).toMatch(/^scrypt-v1\./);
    expect(stored?.passwordHash).not.toContain('very-secure-password');

    const cookie = sessionCookie(registered.headers['set-cookie']);
    const session = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.email).toBe('devansh@example.com');

    const created = await app.inject({
      method: 'POST',
      url: '/api/showcases',
      headers: { cookie },
      payload: showcasePayload,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'Private Console', authenticationConfigured: false });
    await app.close();
  });

  it('logs in, logs out, and rejects an invalid password without exposing account existence', async () => {
    const app = await buildApp({
      config: testConfig(),
      repository: new MemoryShowcaseRepository(),
      policy: publicPolicy(),
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/email/register',
      payload: { name: 'Creator', email: 'creator@example.com', password: 'correct-password' },
    });

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/auth/email/login',
      payload: { email: 'creator@example.com', password: 'wrong-password' },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
    });

    const loggedIn = await app.inject({
      method: 'POST',
      url: '/api/auth/email/login',
      payload: { email: 'creator@example.com', password: 'correct-password' },
    });
    const cookie = sessionCookie(loggedIn.headers['set-cookie']);
    const loggedOut = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    expect(loggedOut.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })).statusCode).toBe(401);
    await app.close();
  });

  it('isolates showcases between signed-in creators', async () => {
    const app = await buildApp({
      config: testConfig(),
      repository: new MemoryShowcaseRepository(),
      policy: publicPolicy(),
    });
    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/email/register',
      payload: { name: 'First', email: 'first@example.com', password: 'first-password' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/email/register',
      payload: { name: 'Second', email: 'second@example.com', password: 'second-password' },
    });
    const firstCookie = sessionCookie(first.headers['set-cookie']);
    const secondCookie = sessionCookie(second.headers['set-cookie']);
    const created = await app.inject({
      method: 'POST',
      url: '/api/showcases',
      headers: { cookie: firstCookie },
      payload: showcasePayload,
    });
    expect((await app.inject({ method: 'GET', url: '/api/showcases', headers: { cookie: firstCookie } })).json()).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: '/api/showcases', headers: { cookie: secondCookie } })).json()).toHaveLength(0);
    expect((await app.inject({
      method: 'GET',
      url: `/api/showcases/${created.json().id}`,
      headers: { cookie: secondCookie },
    })).statusCode).toBe(404);
    await app.close();
  });

  it('reports an OAuth provider as unavailable until its credentials are configured', async () => {
    const app = await buildApp({
      config: testConfig(),
      repository: new MemoryShowcaseRepository(),
      policy: publicPolicy(),
    });
    const response = await app.inject({ method: 'GET', url: '/api/auth/oauth/github' });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('AUTH_PROVIDER_UNAVAILABLE');
    await app.close();
  });
});
