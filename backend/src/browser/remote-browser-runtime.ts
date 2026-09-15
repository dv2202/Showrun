import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright';
import type { SessionMaterial, ShowcaseRoute } from '../domain/types.js';
import { AppError } from '../errors.js';
import { SecureHttpClient } from '../proxy/secure-http-client.js';
import { TargetPolicy } from '../security/target-policy.js';
import { normalizeRoutePath, routeIsAllowed } from '../showcases/route-policy.js';

const safeViewerMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const allowedKeys = new Set([
  'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Backspace', 'Delete', 'End', 'Enter',
  'Escape', 'Home', 'PageDown', 'PageUp', 'Space', 'Tab',
]);

export interface RemoteViewport {
  width: number;
  height: number;
}

export type RemoteBrowserInput =
  | { type: 'click'; x: number; y: number; button: 'left' | 'middle' | 'right'; clickCount: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'wheel'; deltaX: number; deltaY: number }
  | { type: 'key'; key: string }
  | { type: 'text'; text: string };

export interface RemoteBrowserSessionHandle {
  id: string;
  token: string;
  viewport: RemoteViewport;
  currentPath: string;
}

export interface RemoteBrowserFrame {
  body: Buffer;
  currentPath: string;
  blockedRequests: number;
}

export interface ViewerRuntimeInput {
  showcaseId: string;
  targetUrl: string;
  routes: ShowcaseRoute[];
  initialPath: string;
  material: SessionMaterial;
  viewport: RemoteViewport;
}

export interface AuthenticationRuntimeInput {
  showcaseId: string;
  targetUrl: string;
  initialUrl?: string;
  viewport: RemoteViewport;
}

export interface RemoteBrowserRuntime {
  startViewer(input: ViewerRuntimeInput): Promise<RemoteBrowserSessionHandle>;
  startAuthentication(input: AuthenticationRuntimeInput): Promise<RemoteBrowserSessionHandle>;
  frame(id: string, token: string): Promise<RemoteBrowserFrame>;
  input(id: string, token: string, input: RemoteBrowserInput): Promise<void>;
  navigate(id: string, token: string, path: string): Promise<string>;
  captureAuthentication(id: string, token: string, showcaseId: string): Promise<SessionMaterial>;
  closeSession(id: string, token: string): Promise<void>;
  closeShowcase(showcaseId: string): Promise<void>;
  close(): Promise<void>;
}

interface RuntimeSession {
  id: string;
  tokenHash: Buffer;
  showcaseId: string;
  mode: 'viewer' | 'authentication';
  targetBase: URL;
  routes: ShowcaseRoute[];
  context: BrowserContext;
  page: Page;
  viewport: RemoteViewport;
  currentPath: string;
  blockedRequests: number;
  lastAccessedAt: number;
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token).digest();
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

function showcasePathForUrl(targetBase: URL, url: URL): string | null {
  if (url.origin !== targetBase.origin) return null;
  const basePath = targetBase.pathname.endsWith('/') ? targetBase.pathname : `${targetBase.pathname}/`;
  if (url.pathname === basePath.slice(0, -1)) return '/';
  if (!url.pathname.startsWith(basePath)) return null;
  return normalizeRoutePath(`/${url.pathname.slice(basePath.length)}`);
}

function browserRequestHeaders(headers: Record<string, string>): Record<string, string> {
  const blocked = new Set([
    'host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te',
    'trailer', 'transfer-encoding', 'upgrade', 'content-length', 'accept-encoding',
  ]);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !blocked.has(key.toLowerCase())));
}

function responseHeaders(headers: Record<string, string | string[]>): Record<string, string> {
  const blocked = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
    'transfer-encoding', 'upgrade', 'content-length', 'set-cookie',
  ]);
  return Object.fromEntries(Object.entries(headers)
    .filter(([key]) => !blocked.has(key.toLowerCase()))
    .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]));
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
    cookies.push({
      name: first.slice(0, separator),
      value: first.slice(separator + 1),
      domain: (attributes.get('domain') ?? responseUrl.hostname).toLowerCase(),
      path: attributes.get('path') ?? '/',
      expires: Number.isFinite(expires) ? expires : -1,
      httpOnly: flags.has('httponly'),
      secure: flags.has('secure'),
      sameSite: sameSiteValue === 'strict' ? 'Strict' : sameSiteValue === 'none' ? 'None' : 'Lax',
    });
  }
  if (cookies.length) await context.addCookies(cookies);
}

export class PlaywrightRemoteBrowserRuntime implements RemoteBrowserRuntime {
  private browserPromise?: Promise<Browser>;
  private readonly sessions = new Map<string, RuntimeSession>();
  private pendingSessions = 0;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(
    private readonly policy: TargetPolicy,
    private readonly http: SecureHttpClient,
    private readonly headless: boolean,
    private readonly executablePath: string | undefined,
    private readonly maximumSessions: number,
    private readonly idleTtlMs: number,
    private readonly launcher: Pick<typeof chromium, 'launch'> = chromium,
  ) {
    this.cleanupTimer = setInterval(() => void this.removeIdleSessions(), Math.min(30_000, idleTtlMs));
    this.cleanupTimer.unref();
  }

  async startViewer(input: ViewerRuntimeInput): Promise<RemoteBrowserSessionHandle> {
    const targetBase = (await this.policy.validate(input.targetUrl)).url;
    const initialPath = normalizeRoutePath(input.initialPath);
    if (!routeIsAllowed(initialPath, input.routes)) {
      throw new AppError('NOT_FOUND', 'Showcase route not found', 404);
    }
    return this.start({
      showcaseId: input.showcaseId,
      mode: 'viewer',
      targetBase,
      routes: input.routes,
      initialUrl: routeTargetUrl(targetBase, initialPath),
      initialPath,
      material: input.material,
      viewport: input.viewport,
    });
  }

  async startAuthentication(input: AuthenticationRuntimeInput): Promise<RemoteBrowserSessionHandle> {
    const targetBase = (await this.policy.validate(input.targetUrl)).url;
    const initialUrl = (await this.policy.validate(input.initialUrl ?? input.targetUrl)).url;
    return this.start({
      showcaseId: input.showcaseId,
      mode: 'authentication',
      targetBase,
      routes: [],
      initialUrl,
      initialPath: initialUrl.pathname,
      viewport: input.viewport,
    });
  }

  async frame(id: string, token: string): Promise<RemoteBrowserFrame> {
    const session = this.session(id, token);
    const body = await session.page.screenshot({ type: 'jpeg', quality: 76 });
    return {
      body,
      currentPath: session.currentPath,
      blockedRequests: session.blockedRequests,
    };
  }

  async input(id: string, token: string, input: RemoteBrowserInput): Promise<void> {
    const session = this.session(id, token);
    switch (input.type) {
      case 'click':
        await session.page.mouse.click(input.x, input.y, {
          button: input.button,
          clickCount: input.clickCount,
        });
        return;
      case 'move':
        await session.page.mouse.move(input.x, input.y);
        return;
      case 'wheel':
        await session.page.mouse.wheel(input.deltaX, input.deltaY);
        return;
      case 'text':
        await session.page.keyboard.insertText(input.text);
        return;
      case 'key':
        if (!allowedKeys.has(input.key)) {
          throw new AppError('VALIDATION_ERROR', 'Remote browser key is not allowed', 400);
        }
        await session.page.keyboard.press(input.key);
    }
  }

  async navigate(id: string, token: string, path: string): Promise<string> {
    const session = this.session(id, token);
    if (session.mode !== 'viewer') {
      throw new AppError('VALIDATION_ERROR', 'This browser session does not support route navigation', 400);
    }
    const normalized = normalizeRoutePath(path);
    if (!routeIsAllowed(normalized, session.routes)) {
      throw new AppError('NOT_FOUND', 'Showcase route not found', 404);
    }
    await session.page.goto(routeTargetUrl(session.targetBase, normalized).href, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    session.currentPath = normalized;
    return normalized;
  }

  async captureAuthentication(id: string, token: string, showcaseId: string): Promise<SessionMaterial> {
    const session = this.session(id, token);
    if (session.mode !== 'authentication' || session.showcaseId !== showcaseId) {
      throw new AppError('NOT_FOUND', 'Remote browser session not found', 404);
    }
    const material = await session.context.storageState() as SessionMaterial;
    const sessionOrigins = [] as NonNullable<SessionMaterial['sessionOrigins']>;
    for (const page of session.context.pages()) {
      const values = await page.evaluate(() =>
        Object.entries(window.sessionStorage).map(([name, value]) => ({ name, value })),
      ).catch(() => [] as Array<{ name: string; value: string }>);
      if (!values.length) continue;
      try {
        sessionOrigins.push({ origin: new URL(page.url()).origin, sessionStorage: values });
      } catch {
        // Ignore non-HTTP pages such as an empty popup.
      }
    }
    if (sessionOrigins.length) material.sessionOrigins = sessionOrigins;
    return material;
  }

  async closeSession(id: string, token: string): Promise<void> {
    const session = this.session(id, token);
    this.sessions.delete(id);
    await session.context.close().catch(() => undefined);
  }

  async closeShowcase(showcaseId: string): Promise<void> {
    const sessions = [...this.sessions.values()].filter((session) => session.showcaseId === showcaseId);
    await Promise.all(sessions.map(async (session) => {
      this.sessions.delete(session.id);
      await session.context.close().catch(() => undefined);
    }));
  }

  async close(): Promise<void> {
    clearInterval(this.cleanupTimer);
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(sessions.map((session) => session.context.close().catch(() => undefined)));
    const browser = await this.browserPromise?.catch(() => undefined);
    await browser?.close().catch(() => undefined);
    this.browserPromise = undefined;
  }

  private async start(input: {
    showcaseId: string;
    mode: RuntimeSession['mode'];
    targetBase: URL;
    routes: ShowcaseRoute[];
    initialUrl: URL;
    initialPath: string;
    material?: SessionMaterial;
    viewport: RemoteViewport;
  }): Promise<RemoteBrowserSessionHandle> {
    await this.removeIdleSessions();
    if (this.sessions.size + this.pendingSessions >= this.maximumSessions) {
      throw new AppError('CONFLICT', 'Remote browser capacity is currently full', 503);
    }
    this.pendingSessions += 1;
    try {
      const browser = await this.browser();
      const context = await browser.newContext({
        viewport: input.viewport,
        deviceScaleFactor: 1,
        acceptDownloads: false,
        serviceWorkers: 'block',
        storageState: input.material ? {
          cookies: input.material.cookies ?? [],
          origins: input.material.origins ?? [],
        } : undefined,
        ...(input.material?.headers ? { extraHTTPHeaders: input.material.headers } : {}),
      });
      let session: RuntimeSession | undefined;
      try {
        if (input.material?.sessionOrigins?.length) {
          await context.addInitScript((origins) => {
            const current = origins.find((entry) => entry.origin === window.location.origin);
            for (const item of current?.sessionStorage ?? []) window.sessionStorage.setItem(item.name, item.value);
          }, input.material.sessionOrigins);
        }
        const page = await context.newPage();
        const id = randomBytes(18).toString('base64url');
        const token = randomBytes(32).toString('base64url');
        session = {
          id,
          tokenHash: tokenHash(token),
          showcaseId: input.showcaseId,
          mode: input.mode,
          targetBase: input.targetBase,
          routes: input.routes,
          context,
          page,
          viewport: input.viewport,
          currentPath: input.initialPath,
          blockedRequests: 0,
          lastAccessedAt: Date.now(),
        };
        const activeSession = session;
        await context.route('**/*', (route) => this.fulfillSecurely(activeSession, route));
        if ('routeWebSocket' in context) {
          await context.routeWebSocket('**/*', (socket) => {
            activeSession.blockedRequests += 1;
            socket.close();
          });
        }
        page.on('dialog', (dialog) => void dialog.dismiss());
        page.on('popup', (popup) => void popup.close());
        page.on('framenavigated', (frame) => {
          if (frame !== page.mainFrame()) return;
          try {
            const url = new URL(frame.url());
            const showcasePath = showcasePathForUrl(input.targetBase, url);
            if (showcasePath) activeSession.currentPath = showcasePath;
          } catch {
            // Ignore transient browser pages.
          }
        });
        this.sessions.set(id, session);
        await page.goto(input.initialUrl.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        return { id, token, viewport: input.viewport, currentPath: session.currentPath };
      } catch (error) {
        if (session) this.sessions.delete(session.id);
        await context.close().catch(() => undefined);
        if (error instanceof AppError) throw error;
        throw new AppError('TARGET_UNAVAILABLE', 'Remote browser could not load the application', 502, {
          cause: error,
        });
      }
    } finally {
      this.pendingSessions -= 1;
    }
  }

  private session(id: string, token: string): RuntimeSession {
    const session = this.sessions.get(id);
    const suppliedHash = tokenHash(token);
    if (!session || !timingSafeEqual(session.tokenHash, suppliedHash)) {
      throw new AppError('NOT_FOUND', 'Remote browser session not found', 404);
    }
    if (Date.now() - session.lastAccessedAt > this.idleTtlMs) {
      this.sessions.delete(id);
      void session.context.close();
      throw new AppError('AUTHENTICATION_EXPIRED', 'Remote browser session expired', 410);
    }
    session.lastAccessedAt = Date.now();
    return session;
  }

  private async browser(): Promise<Browser> {
    this.browserPromise ??= this.launcher.launch({
      headless: this.headless,
      ...(this.executablePath ? { executablePath: this.executablePath } : {}),
    }).then((browser) => {
      browser.on('disconnected', () => {
        this.browserPromise = undefined;
        this.sessions.clear();
      });
      return browser;
    }).catch((error) => {
      this.browserPromise = undefined;
      throw new AppError('TARGET_UNAVAILABLE', 'Remote browser could not be started', 503, { cause: error });
    });
    return this.browserPromise;
  }

  private async fulfillSecurely(session: RuntimeSession, route: Route): Promise<void> {
    const request = route.request();
    const rawUrl = request.url();
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      await route.abort('blockedbyclient');
      return;
    }
    try {
      const url = new URL(rawUrl);
      if (session.mode === 'viewer') {
        if (!safeViewerMethods.has(request.method().toUpperCase())) {
          session.blockedRequests += 1;
          await route.abort('blockedbyclient');
          return;
        }
        const showcasePath = showcasePathForUrl(session.targetBase, url);
        if (request.isNavigationRequest() && request.frame() === session.page.mainFrame() &&
          (!showcasePath || !routeIsAllowed(showcasePath, session.routes))) {
          session.blockedRequests += 1;
          await route.abort('blockedbyclient');
          return;
        }
      }
      const result = await this.http.fetch(url, {
        method: request.method(),
        headers: browserRequestHeaders(request.headers()),
        ...(request.postDataBuffer() ? { body: request.postDataBuffer()! } : {}),
        maxRedirects: 0,
      });
      await applyResponseCookies(session.context, url, result.headers);
      await route.fulfill({
        status: result.status,
        headers: responseHeaders(result.headers),
        body: result.body,
      });
    } catch {
      session.blockedRequests += 1;
      await route.abort('blockedbyclient');
    }
  }

  private async removeIdleSessions(): Promise<void> {
    const cutoff = Date.now() - this.idleTtlMs;
    const expired = [...this.sessions.values()].filter((session) => session.lastAccessedAt < cutoff);
    await Promise.all(expired.map(async (session) => {
      this.sessions.delete(session.id);
      await session.context.close().catch(() => undefined);
    }));
  }
}
