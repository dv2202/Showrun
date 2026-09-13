import { chromium, type Browser, type BrowserContext, type Route } from 'playwright';
import { AppError } from '../errors.js';
import type { SessionMaterial, VerificationStrategy } from '../domain/types.js';
import { SecureHttpClient } from '../proxy/secure-http-client.js';
import { TargetPolicy } from '../security/target-policy.js';

export interface PasswordBootstrapConfig {
  loginUrl: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  verification: VerificationStrategy;
  timeoutMs?: number;
}

export interface PasswordSecret {
  username: string;
  password: string;
}

function flattenedHeaders(headers: Record<string, string | string[]>): Record<string, string> {
  const blocked = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length', 'set-cookie']);
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (blocked.has(key.toLowerCase())) continue;
    output[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return output;
}

async function applyResponseCookies(
  context: BrowserContext,
  responseUrl: URL,
  headers: Record<string, string | string[]>,
): Promise<void> {
  const raw = headers['set-cookie'];
  if (!raw) return;
  const lines = Array.isArray(raw) ? raw : [raw];
  const cookies: Array<Parameters<BrowserContext['addCookies']>[0][number]> = [];
  for (const line of lines) {
    const parts = line.split(';').map((part) => part.trim());
    const first = parts.shift();
    if (!first) continue;
    const separator = first.indexOf('=');
    if (separator <= 0) continue;
    const attributes = new Map<string, string>();
    const flags = new Set<string>();
    for (const part of parts) {
      const index = part.indexOf('=');
      if (index === -1) flags.add(part.toLowerCase());
      else attributes.set(part.slice(0, index).toLowerCase(), part.slice(index + 1));
    }
    const maxAge = Number(attributes.get('max-age'));
    const expiresValue = attributes.get('expires');
    const expires = Number.isFinite(maxAge)
      ? Math.floor(Date.now() / 1000) + maxAge
      : expiresValue ? Math.floor(Date.parse(expiresValue) / 1000) : -1;
    const sameSiteValue = attributes.get('samesite')?.toLowerCase();
    const sameSite = sameSiteValue === 'strict' ? 'Strict' : sameSiteValue === 'none' ? 'None' : 'Lax';
    cookies.push({
      name: first.slice(0, separator),
      value: first.slice(separator + 1),
      domain: (attributes.get('domain') ?? responseUrl.hostname).toLowerCase(),
      path: attributes.get('path') ?? '/',
      expires: Number.isFinite(expires) ? expires : -1,
      httpOnly: flags.has('httponly'),
      secure: flags.has('secure'),
      sameSite,
    });
  }
  if (cookies.length) await context.addCookies(cookies);
}

function browserRequestHeaders(headers: Record<string, string>): Record<string, string> {
  const blocked = new Set(['host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length', 'accept-encoding']);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !blocked.has(key.toLowerCase())));
}

export class PlaywrightBootstrapper {
  constructor(
    private readonly policy: TargetPolicy,
    private readonly http: SecureHttpClient,
    private readonly headless = true,
    private readonly executablePath?: string,
    private readonly launcher: Pick<typeof chromium, 'launch'> = chromium,
  ) {}

  async authenticate(config: PasswordBootstrapConfig, secret: PasswordSecret): Promise<SessionMaterial> {
    await this.policy.validate(config.loginUrl);
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let stageMessage = 'Authentication browser could not be started';
    try {
      browser = await this.launcher.launch({
        headless: this.headless,
        ...(this.executablePath ? { executablePath: this.executablePath } : {}),
      });
      stageMessage = 'Authentication browser context could not be created';
      context = await browser.newContext({ serviceWorkers: 'block' });
      await context.route('**/*', (route) => this.fulfillSecurely(context!, route));
      if ('routeWebSocket' in context) {
        await context.routeWebSocket('**/*', (socket) => socket.close());
      }
      const page = await context.newPage();
      const timeout = config.timeoutMs ?? 30_000;
      stageMessage = 'Login page could not be loaded';
      await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout });
      stageMessage = 'Username field was not found or could not be filled';
      await page.locator(config.usernameSelector).fill(secret.username, { timeout });
      stageMessage = 'Password field was not found or could not be filled';
      await page.locator(config.passwordSelector).fill(secret.password, { timeout });
      stageMessage = 'Login submit control was not found or could not be activated';
      await page.locator(config.submitSelector).click({ timeout });
      stageMessage = 'Login completed, but authentication could not be verified';
      await this.verify(page, config.verification, timeout);
      stageMessage = 'Authenticated session could not be captured';
      return (await context.storageState()) as SessionMaterial;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('AUTHENTICATION_FAILED', stageMessage, 422, {
        cause: error,
      });
    } finally {
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }

  private async fulfillSecurely(context: BrowserContext, route: Route): Promise<void> {
    const request = route.request();
    const url = request.url();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      await route.abort('blockedbyclient');
      return;
    }
    try {
      const result = await this.http.fetch(url, {
        method: request.method(),
        headers: browserRequestHeaders(request.headers()),
        ...(request.postDataBuffer() ? { body: request.postDataBuffer()! } : {}),
        maxRedirects: 0,
      });
      await applyResponseCookies(context, new URL(url), result.headers);
      await route.fulfill({
        status: result.status,
        headers: flattenedHeaders(result.headers),
        body: result.body,
      });
    } catch {
      await route.abort('blockedbyclient');
    }
  }

  private async verify(
    page: import('playwright').Page,
    verification: VerificationStrategy,
    timeout: number,
  ): Promise<void> {
    switch (verification.type) {
      case 'expected_url':
        await page.waitForURL(
          (url) => verification.match === 'prefix'
            ? url.href.startsWith(verification.url)
            : url.href === verification.url,
          { timeout },
        );
        return;
      case 'expected_selector':
        await page.locator(verification.selector).waitFor({ state: 'visible', timeout });
        return;
      case 'absence_of_login_selector':
        await page.locator(verification.selector).waitFor({ state: 'hidden', timeout });
        return;
      case 'authenticated_endpoint': {
        const response = await page.goto(verification.url, { waitUntil: 'domcontentloaded', timeout });
        if (!response || response.status() !== (verification.expectedStatus ?? 200)) {
          throw new AppError('AUTHENTICATION_FAILED', 'Authentication verification failed', 422);
        }
      }
    }
  }
}
