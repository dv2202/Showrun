import { describe, expect, it, vi } from 'vitest';
import type { Browser, BrowserContext, BrowserType, Locator, Page } from 'playwright';
import { PlaywrightBootstrapper } from '../src/browser/playwright-bootstrapper.js';
import { SecureHttpClient } from '../src/proxy/secure-http-client.js';
import { publicPolicy } from './helpers.js';

function fakeBrowser(verificationFails = false) {
  const fill = vi.fn(async () => undefined);
  let requestListener: ((request: { headers(): Record<string, string> }) => void) | undefined;
  const click = vi.fn(async () => {
    requestListener?.({ headers: () => ({ authorization: 'Bearer real-access-token' }) });
  });
  const waitFor = vi.fn(async () => {
    if (verificationFails) throw new Error('selector not found');
  });
  const locator = vi.fn(() => ({ fill, click, waitFor }) as unknown as Locator);
  const page = {
    goto: vi.fn(async () => ({ status: () => 200 })),
    locator,
    waitForURL: vi.fn(async () => undefined),
    on: vi.fn((event: string, listener: typeof requestListener) => {
      if (event === 'request') requestListener = listener;
    }),
    evaluate: vi.fn(async () => [{ name: 'temporary_session', value: 'session-storage-value' }]),
    url: vi.fn(() => 'https://login.test/dashboard'),
  } as unknown as Page;
  const contextClose = vi.fn(async () => undefined);
  const context = {
    route: vi.fn(async () => undefined),
    newPage: vi.fn(async () => page),
    storageState: vi.fn(async () => ({
      cookies: [{
        name: 'sid', value: 'server-session', domain: 'login.test', path: '/', expires: -1,
        httpOnly: true, secure: true, sameSite: 'Lax' as const,
      }],
      origins: [{
        origin: 'https://login.test',
        localStorage: [{ name: 'access_token', value: 'real-access-token' }],
      }],
    })),
    close: contextClose,
  } as unknown as BrowserContext;
  const browserClose = vi.fn(async () => undefined);
  const browser = {
    newContext: vi.fn(async () => context),
    close: browserClose,
  } as unknown as Browser;
  const launch = vi.fn(async () => browser);
  return { launch, fill, click, waitFor, contextClose, browserClose };
}

describe('Playwright password authentication', () => {
  it('fills credentials, verifies state, captures cookies, and always closes Chromium', async () => {
    const fake = fakeBrowser();
    const policy = publicPolicy();
    const bootstrapper = new PlaywrightBootstrapper(
      policy,
      new SecureHttpClient(policy, 1000, 100_000),
      true,
      undefined,
      { launch: fake.launch } as unknown as Pick<BrowserType, 'launch'>,
    );
    const state = await bootstrapper.authenticate({
      loginUrl: 'https://login.test/login',
      usernameSelector: '#username',
      passwordSelector: '#password',
      submitSelector: 'button[type=submit]',
      verification: { type: 'expected_selector', selector: '[data-user-menu]' },
    }, { username: 'developer@example.com', password: 'private-password' });

    expect(fake.fill).toHaveBeenCalledTimes(2);
    expect(fake.click).toHaveBeenCalledOnce();
    expect(fake.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 30_000 });
    expect(state.cookies?.[0]?.name).toBe('sid');
    expect(state.sessionOrigins).toEqual([{
      origin: 'https://login.test',
      sessionStorage: [{ name: 'temporary_session', value: 'session-storage-value' }],
    }]);
    expect(state.sessionCandidates).toContainEqual({
      storage: 'localStorage',
      name: 'access_token',
      confidence: 'high',
      requestHeaders: ['authorization'],
    });
    expect(fake.contextClose).toHaveBeenCalledOnce();
    expect(fake.browserClose).toHaveBeenCalledOnce();
  });

  it('reports verification failure and still closes the browser', async () => {
    const fake = fakeBrowser(true);
    const policy = publicPolicy();
    const bootstrapper = new PlaywrightBootstrapper(
      policy,
      new SecureHttpClient(policy, 1000, 100_000),
      true,
      undefined,
      { launch: fake.launch } as unknown as Pick<BrowserType, 'launch'>,
    );
    await expect(bootstrapper.authenticate({
      loginUrl: 'https://login.test/login',
      usernameSelector: '#username',
      passwordSelector: '#password',
      submitSelector: 'button[type=submit]',
      verification: { type: 'expected_selector', selector: '[data-user-menu]' },
    }, { username: 'developer@example.com', password: 'wrong-password' }))
      .rejects.toMatchObject({
        code: 'AUTHENTICATION_FAILED',
        publicMessage: 'Login completed, but authentication could not be verified',
      });
    expect(fake.contextClose).toHaveBeenCalledOnce();
    expect(fake.browserClose).toHaveBeenCalledOnce();
  });

  it('reports a browser installation or launch failure explicitly', async () => {
    const policy = publicPolicy();
    const launch = vi.fn(async () => {
      throw new Error('Executable does not exist');
    });
    const bootstrapper = new PlaywrightBootstrapper(
      policy,
      new SecureHttpClient(policy, 1000, 100_000),
      true,
      undefined,
      { launch } as unknown as Pick<BrowserType, 'launch'>,
    );

    await expect(bootstrapper.authenticate({
      loginUrl: 'https://login.test/login',
      usernameSelector: '#username',
      passwordSelector: '#password',
      submitSelector: 'button[type=submit]',
      verification: { type: 'expected_selector', selector: '[data-user-menu]' },
    }, { username: 'developer@example.com', password: 'private-password' }))
      .rejects.toMatchObject({
        code: 'AUTHENTICATION_FAILED',
        publicMessage: 'Authentication browser could not be started',
      });
  });
});
