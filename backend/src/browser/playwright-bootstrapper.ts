import { createHash } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Route } from 'playwright';
import { AppError } from '../errors.js';
import type {
  SessionMaterial,
  SessionCandidate,
  CompatibilityReport,
  ShowcaseDependency,
  ShowcaseDependencyCategory,
  ShowcaseRoute,
  VerificationStrategy,
} from '../domain/types.js';
import { SecureHttpClient } from '../proxy/secure-http-client.js';
import { TargetPolicy } from '../security/target-policy.js';
import { inspectJsonResponseFields } from '../proxy/dependency-inspection.js';
import { originAliasFor } from '../proxy/preview-origin.js';
import { observedSessionHeaders } from '../proxy/session-bridge.js';

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

export interface DependencyScanner {
  scan(
    targetUrl: string,
    routes: ShowcaseRoute[],
    material: SessionMaterial,
  ): Promise<ShowcaseDependency[]>;
}

export interface CompatibilityChecker {
  check(publicUrl: string, routes: ShowcaseRoute[], sensitiveValues: string[]): Promise<CompatibilityReport>;
}

function sessionCandidates(
  material: SessionMaterial,
  observedHeaders: Array<Record<string, string>>,
): SessionCandidate[] {
  const candidates: Array<{ storage: SessionCandidate['storage']; name: string; value: string }> = [
    ...(material.cookies ?? []).map(({ name, value }) => ({ storage: 'cookie' as const, name, value })),
    ...(material.origins ?? []).flatMap((origin) =>
      origin.localStorage.map(({ name, value }) => ({ storage: 'localStorage' as const, name, value }))),
    ...(material.sessionOrigins ?? []).flatMap((origin) =>
      origin.sessionStorage.map(({ name, value }) => ({ storage: 'sessionStorage' as const, name, value }))),
  ];
  return candidates.slice(0, 100).map((candidate) => {
    const requestHeaders = [...new Set(observedHeaders.flatMap((headers) =>
      Object.entries(headers)
        .filter(([, value]) => candidate.value.length >= 8 && value.includes(candidate.value))
        .map(([name]) => name.toLowerCase()),
    ))];
    const confidence = requestHeaders.length
      ? 'high'
      : /auth|token|session|jwt/i.test(candidate.name) ? 'medium' : 'low';
    return { storage: candidate.storage, name: candidate.name, confidence, requestHeaders };
  });
}

function dependencyCategory(contentType: string, resourceType: string): ShowcaseDependencyCategory {
  const mime = contentType.split(';', 1)[0]!.trim().toLowerCase();
  if (resourceType === 'script' || /(?:javascript|ecmascript|wasm)/.test(mime)) return 'script';
  if (resourceType === 'stylesheet' || mime === 'text/css') return 'style';
  if (resourceType === 'font' || mime.startsWith('font/') || /woff|opentype|truetype/.test(mime)) {
    return 'font';
  }
  if (resourceType === 'image' || mime.startsWith('image/')) return 'image';
  if (resourceType === 'fetch' || resourceType === 'xhr' || /json|xml/.test(mime)) {
    return 'read_api';
  }
  return 'other';
}

function routeTargetUrl(targetBase: URL, routePath: string): URL {
  const target = new URL(targetBase);
  const basePath = targetBase.pathname.endsWith('/') ? targetBase.pathname : `${targetBase.pathname}/`;
  target.pathname = routePath === '/'
    ? basePath
    : `${basePath}${routePath.slice(1)}`.replace(/\/+/g, '/');
  target.search = '';
  target.hash = '';
  return target;
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
      const observedHeaders: Array<Record<string, string>> = [];
      if (typeof page.on === 'function') {
        page.on('request', (request) => {
          if (observedHeaders.length < 500) observedHeaders.push(request.headers());
        });
      }
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
      const material = (await context.storageState()) as SessionMaterial;
      const sessionStorage = typeof page.evaluate === 'function'
        ? await page.evaluate(() =>
          Object.entries(window.sessionStorage).map(([name, value]) => ({ name, value })),
        ).catch(() => [] as Array<{ name: string; value: string }>)
        : [];
      if (sessionStorage.length) {
        material.sessionOrigins = [{ origin: new URL(page.url()).origin, sessionStorage }];
      }
      material.sessionCandidates = sessionCandidates(material, observedHeaders);
      return material;
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

  async scan(
    targetUrl: string,
    routes: ShowcaseRoute[],
    material: SessionMaterial,
  ): Promise<ShowcaseDependency[]> {
    const targetBase = await this.policy.validate(targetUrl).then((result) => result.url);
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    const discovered = new Map<string, ShowcaseDependency>();
    const pagePaths = new Set(routes.map((route) => routeTargetUrl(targetBase, route.path).pathname));
    let requestCount = 0;
    try {
      browser = await this.launcher.launch({
        headless: this.headless,
        ...(this.executablePath ? { executablePath: this.executablePath } : {}),
      });
      context = await browser.newContext({
        serviceWorkers: 'block',
        storageState: {
          cookies: material.cookies ?? [],
          origins: material.origins ?? [],
        },
        ...(material.headers ? { extraHTTPHeaders: material.headers } : {}),
      });
      if (material.sessionOrigins?.length) {
        await context.addInitScript((origins) => {
          const current = origins.find((entry) => entry.origin === window.location.origin);
          if (!current) return;
          for (const item of current.sessionStorage) window.sessionStorage.setItem(item.name, item.value);
        }, material.sessionOrigins);
      }
      await context.route('**/*', async (route) => {
        const request = route.request();
        const method = request.method().toUpperCase();
        let requestUrl: URL;
        try {
          requestUrl = new URL(request.url());
        } catch {
          await route.abort('blockedbyclient');
          return;
        }
        if (!['GET', 'HEAD'].includes(method) || requestCount >= 250) {
          await route.abort('blockedbyclient');
          return;
        }
        requestCount += 1;
        await this.fulfillSecurely(context!, route, (response) => {
          if (response.status < 200 || response.status >= 400 || pagePaths.has(requestUrl.pathname)) {
            return;
          }
          const contentTypeValue = response.headers['content-type'];
          const contentType = Array.isArray(contentTypeValue)
            ? contentTypeValue[0] ?? ''
            : contentTypeValue ?? '';
          const category = dependencyCategory(contentType, request.resourceType());
          const originAlias = originAliasFor(requestUrl.origin, targetBase.origin);
          const key = `${requestUrl.origin}${requestUrl.pathname}${requestUrl.search}`;
          const fields = inspectJsonResponseFields(response.body, contentType);
          const sessionHeaders = observedSessionHeaders(material, request.headers());
          discovered.set(key, {
            path: requestUrl.pathname,
            targetPath: requestUrl.pathname,
            targetOrigin: requestUrl.origin,
            originAlias,
            search: requestUrl.search,
            contentType,
            category,
            approved: ['script', 'style', 'font', 'image'].includes(category),
            ...(sessionHeaders.length ? { sessionHeaders } : {}),
            ...(fields?.length ? { responseFields: fields } : {}),
            redactedFields: [],
            contentHash: createHash('sha256').update(response.body).digest('hex'),
            discoveredAt: new Date().toISOString(),
          });
        });
      });
      if ('routeWebSocket' in context) {
        await context.routeWebSocket('**/*', (socket) => socket.close());
      }
      for (const showcaseRoute of routes) {
        const page = await context.newPage();
        try {
          await page.goto(routeTargetUrl(targetBase, showcaseRoute.path).href, {
            waitUntil: 'domcontentloaded',
            timeout: 10_000,
          });
          await page.waitForTimeout(1_000);
        } finally {
          await page.close();
        }
      }
      return [...discovered.values()].sort((left, right) => left.path.localeCompare(right.path));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('PROXY_ERROR', 'Showcase dependencies could not be scanned', 502, {
        cause: error,
      });
    } finally {
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }

  async check(
    publicUrl: string,
    routes: ShowcaseRoute[],
    sensitiveValues: string[],
  ): Promise<CompatibilityReport> {
    const expectedOrigin = new URL(publicUrl).origin;
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
      browser = await this.launcher.launch({
        headless: this.headless,
        ...(this.executablePath ? { executablePath: this.executablePath } : {}),
      });
      context = await browser.newContext({ serviceWorkers: 'block' });
      const results: CompatibilityReport['routes'] = [];
      for (const showcaseRoute of routes) {
        const page = await context.newPage();
        const failedRequests: string[] = [];
        const consoleErrors: string[] = [];
        page.on('requestfailed', (request) => {
          if (failedRequests.length < 20) failedRequests.push(request.url());
        });
        page.on('console', (message) => {
          if (message.type() === 'error' && consoleErrors.length < 20) consoleErrors.push(message.text());
        });
        let status: number | null = null;
        let loaded = false;
        let loginDetected = false;
        let secretsExposed = false;
        let mutationsBlocked = false;
        try {
          const url = new URL(showcaseRoute.path, `${publicUrl.replace(/\/$/, '')}/`);
          const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 15_000 });
          status = response?.status() ?? null;
          const contentType = response?.headers()['content-type'] ?? '';
          loaded = status !== null && status >= 200 && status < 400 && /html|xhtml/i.test(contentType);
          await page.waitForTimeout(500);
          const visible = await page.evaluate(() => ({
            html: document.documentElement.outerHTML,
            text: document.body?.innerText ?? '',
            hasPassword: Boolean(document.querySelector('input[type="password"]')),
            local: Object.values(window.localStorage),
            session: Object.values(window.sessionStorage),
            cookies: document.cookie,
          }));
          loginDetected = visible.hasPassword && /\b(?:sign[ -]?in|log[ -]?in)\b/i.test(visible.text);
          const publicSurface = [visible.html, ...visible.local, ...visible.session, visible.cookies];
          secretsExposed = sensitiveValues
            .filter((value) => value.length >= 8)
            .some((value) => publicSurface.some((surface) => surface.includes(value)));
          mutationsBlocked = (await context.request.post(page.url(), {
            data: '{}',
            failOnStatusCode: false,
          })).status() === 405;
        } catch (error) {
          consoleErrors.push(error instanceof Error ? error.message : 'Preview route failed to load');
        } finally {
          results.push({
            path: showcaseRoute.path,
            status,
            loaded,
            loginDetected,
            originIsolated: (() => {
              try { return new URL(page.url()).origin === expectedOrigin; } catch { return false; }
            })(),
            mutationsBlocked,
            secretsExposed,
            failedRequests,
            consoleErrors,
          });
          await page.close();
        }
      }
      return {
        compatible: results.every((result) =>
          result.loaded && !result.loginDetected && result.originIsolated &&
          result.mutationsBlocked && !result.secretsExposed,
        ),
        checkedAt: new Date().toISOString(),
        routes: results,
      };
    } finally {
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }

  private async fulfillSecurely(
    context: BrowserContext,
    route: Route,
    onResponse?: (response: Awaited<ReturnType<SecureHttpClient['fetch']>>) => void,
  ): Promise<void> {
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
      onResponse?.(result);
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
