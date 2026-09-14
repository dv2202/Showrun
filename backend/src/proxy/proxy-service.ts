import type { FastifyRequest } from 'fastify';
import { promisify } from 'node:util';
import { brotliDecompress, gunzip, inflate } from 'node:zlib';
import type { SessionMaterial, SessionTokenLocation, ShowcaseAggregate, ShowcaseDependency } from '../domain/types.js';
import { AppError } from '../errors.js';
import { AuthenticationService } from '../auth/authentication-service.js';
import type { ShowcaseRepository } from '../storage/repository.js';
import { rewriteContent } from './content-rewriter.js';
import { SecureHttpClient, type SecureHttpResponse } from './secure-http-client.js';
import { assertRequestAllowed, normalizeRequestedSuffix } from '../showcases/route-policy.js';
import { PreviewOriginRouter } from './preview-origin.js';
import { SessionBridge } from './session-bridge.js';

const blockedRequestHeaders = new Set([
  'authorization', 'cookie', 'host', 'connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'forwarded',
  'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'content-length',
  'accept-encoding', 'expect', 'proxy-connection', 'origin', 'referer',
]);
const allowedResponseHeaders = new Set([
  'content-type', 'content-language', 'last-modified', 'accept-ranges', 'content-range',
]);

const gunzipAsync = promisify(gunzip);
const inflateAsync = promisify(inflate);
const brotliDecompressAsync = promisify(brotliDecompress);

async function decodedResponseBody(response: SecureHttpResponse): Promise<Buffer> {
  const encodingValue = response.headers['content-encoding'];
  const encoding = (Array.isArray(encodingValue) ? encodingValue.join(',') : encodingValue ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value && value !== 'identity');
  let body = response.body;
  try {
    for (const value of encoding.reverse()) {
      if (value === 'gzip' || value === 'x-gzip') body = await gunzipAsync(body);
      else if (value === 'deflate') body = await inflateAsync(body);
      else if (value === 'br') body = await brotliDecompressAsync(body);
      else throw new Error(`Unsupported content encoding: ${value}`);
    }
    return body;
  } catch (error) {
    throw new AppError('PROXY_ERROR', 'Target response encoding could not be decoded', 502, {
      cause: error,
    });
  }
}

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(private readonly maximum: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.maximum) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    return () => {
      this.active -= 1;
      this.waiters.shift()?.();
    };
  }
}

function cookieHeader(material: SessionMaterial, url: URL): string | undefined {
  const now = Date.now() / 1000;
  const values = (material.cookies ?? []).filter((cookie) => {
    const domain = cookie.domain.replace(/^\./, '').toLowerCase();
    const domainMatches = url.hostname === domain || url.hostname.endsWith(`.${domain}`);
    const cookiePath = cookie.path || '/';
    const pathMatches = url.pathname === cookiePath ||
      (url.pathname.startsWith(cookiePath) && (cookiePath.endsWith('/') || url.pathname[cookiePath.length] === '/'));
    return domainMatches && pathMatches && (!cookie.secure || url.protocol === 'https:') &&
      (cookie.expires === -1 || cookie.expires > now);
  }).map((cookie) => `${cookie.name}=${cookie.value}`);
  return values.length ? values.join('; ') : undefined;
}

function configuredSessionToken(aggregate: ShowcaseAggregate): SessionTokenLocation | undefined {
  if (aggregate.authentication?.provider !== 'password') return undefined;
  const value = aggregate.authentication.config.sessionToken;
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (!['cookie', 'localStorage', 'sessionStorage'].includes(String(candidate.storage)) ||
    typeof candidate.name !== 'string') return undefined;
  return {
    storage: candidate.storage as SessionTokenLocation['storage'],
    name: candidate.name,
  };
}

function localStorageTokenValue(
  material: SessionMaterial,
  targetOrigin: string,
  location: SessionTokenLocation,
): string | undefined {
  if (location.storage === 'cookie') return undefined;
  if (location.storage === 'sessionStorage') {
    const origin = material.sessionOrigins?.find((entry) => {
      try {
        return new URL(entry.origin).origin === targetOrigin;
      } catch {
        return false;
      }
    });
    return origin?.sessionStorage.find((item) => item.name === location.name)?.value;
  }
  const origin = material.origins?.find((entry) => {
    try {
      return new URL(entry.origin).origin === targetOrigin;
    } catch {
      return false;
    }
  });
  return origin?.localStorage.find((item) => item.name === location.name)?.value;
}

function containsSessionPlaceholder(value: string | string[] | undefined, bridgeToken: string): boolean {
  return Array.isArray(value)
    ? value.some((item) => item.includes(bridgeToken))
    : value?.includes(bridgeToken) === true;
}

function substitutedSessionHeaders(
  request: FastifyRequest,
  token: string,
  bridgeToken: string,
  allowedHeaderNames: string[],
): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  const allowedNames = new Set(allowedHeaderNames.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(request.headers)) {
    if (!containsSessionPlaceholder(value, bridgeToken)) continue;
    const lower = key.toLowerCase();
    const allowed = allowedNames.has(lower) && (lower === 'authorization' ||
      (!blockedRequestHeaders.has(lower) && !lower.startsWith('x-forwarded-') && lower !== 'x-real-ip'));
    if (!allowed || value === undefined) continue;
    headers[key] = Array.isArray(value)
      ? value.map((item) => item.replaceAll(bridgeToken, token))
      : value.replaceAll(bridgeToken, token);
  }
  return headers;
}

function requestHeaders(request: FastifyRequest, bridgeToken: string): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = {};
  const connectionHeaders = new Set(
    (request.headers.connection ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  for (const [key, value] of Object.entries(request.headers)) {
    const lower = key.toLowerCase();
    if (!blockedRequestHeaders.has(lower) && !connectionHeaders.has(lower) &&
      !lower.startsWith('x-forwarded-') && lower !== 'x-real-ip' && value !== undefined &&
      !containsSessionPlaceholder(value, bridgeToken)) headers[key] = value;
  }
  return headers;
}

function responseHeaders(response: SecureHttpResponse): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  const connectionValue = response.headers.connection;
  const connectionHeaders = new Set(
    (Array.isArray(connectionValue) ? connectionValue.join(',') : connectionValue ?? '')
      .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  for (const [key, value] of Object.entries(response.headers)) {
    const lower = key.toLowerCase();
    if (allowedResponseHeaders.has(lower) && !connectionHeaders.has(lower)) headers[key] = value;
  }
  return headers;
}

function requestBody(request: FastifyRequest): Buffer | undefined {
  if (request.body === undefined || request.body === null) return undefined;
  if (Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === 'string') return Buffer.from(request.body);
  return Buffer.from(JSON.stringify(request.body));
}

export interface ProxyResult {
  status: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
}

function inferredSessionToken(material: SessionMaterial): SessionTokenLocation | undefined {
  const candidates = (material.sessionCandidates ?? []).filter((candidate) =>
    candidate.confidence === 'high' && candidate.storage !== 'cookie',
  );
  if (candidates.length !== 1) return undefined;
  return { storage: candidates[0]!.storage, name: candidates[0]!.name };
}

function dependencyOrigin(dependency: ShowcaseDependency | null, targetBase: URL): string {
  if (!dependency?.targetOrigin) {
    if (dependency?.originAlias) {
      throw new AppError('PROXY_ERROR', 'The approved supporting resource is invalid', 502);
    }
    return targetBase.origin;
  }
  try {
    return new URL(dependency.targetOrigin).origin;
  } catch (error) {
    throw new AppError('PROXY_ERROR', 'The approved supporting resource is invalid', 502, {
      cause: error,
    });
  }
}

function jsonPointerSegments(pointer: string): string[] {
  if (!pointer.startsWith('/')) return [];
  return pointer.slice(1).split('/').map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function redactJson(body: Buffer, dependency: ShowcaseDependency | null): Buffer {
  if (!dependency?.redactedFields?.length) return body;
  try {
    const value: unknown = JSON.parse(body.toString('utf8'));
    for (const pointer of dependency.redactedFields) {
      const segments = jsonPointerSegments(pointer);
      if (!segments.length) {
        throw new AppError('PROXY_ERROR', 'Approved response no longer matches its redaction policy', 502);
      }
      let parent: unknown = value;
      for (const segment of segments.slice(0, -1)) {
        if (!parent || typeof parent !== 'object' || !Object.prototype.hasOwnProperty.call(parent, segment)) {
          throw new AppError('PROXY_ERROR', 'Approved response no longer matches its redaction policy', 502);
        }
        parent = (parent as Record<string, unknown>)[segment];
      }
      const key = segments.at(-1)!;
      if (!parent || typeof parent !== 'object' || !Object.prototype.hasOwnProperty.call(parent, key)) {
        throw new AppError('PROXY_ERROR', 'Approved response no longer matches its redaction policy', 502);
      }
      (parent as Record<string, unknown>)[key] = '[REDACTED]';
    }
    return Buffer.from(JSON.stringify(value));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('PROXY_ERROR', 'Approved response could not be safely redacted', 502, {
      cause: error,
    });
  }
}

export class ProxyService {
  private readonly semaphore: Semaphore;

  constructor(
    private readonly repository: ShowcaseRepository,
    private readonly authentication: AuthenticationService,
    private readonly http: SecureHttpClient,
    maximumConcurrency: number,
    private readonly previewOrigins: PreviewOriginRouter,
    private readonly frontendOrigin: string,
    private readonly sessionBridge: SessionBridge,
  ) {
    this.semaphore = new Semaphore(maximumConcurrency);
  }

  async proxy(
    aggregate: ShowcaseAggregate,
    suffix: string,
    request: FastifyRequest,
    originAlias: string | null = null,
  ): Promise<ProxyResult> {
    const release = await this.semaphore.acquire();
    try {
      const requestedPath = normalizeRequestedSuffix(suffix);
      const incoming = new URL(request.raw.url ?? '/', 'http://showcase.invalid');
      const dependency = assertRequestAllowed(
        requestedPath,
        incoming.search,
        aggregate.showcase.routes,
        aggregate.showcase.dependencies,
        originAlias,
      );
      const material = await this.authentication.activeMaterial(aggregate.showcase.id);
      if (!material) throw new AppError('AUTHENTICATION_EXPIRED', 'Showcase authentication is required', 401);
      const targetBase = new URL(aggregate.showcase.targetUrl);
      const upstreamOrigin = dependencyOrigin(dependency, targetBase);
      const sessionToken = configuredSessionToken(aggregate) ?? inferredSessionToken(material);
      const localStorageToken = sessionToken
        ? localStorageTokenValue(material, targetBase.origin, sessionToken)
        : undefined;
      if (sessionToken && sessionToken.storage !== 'cookie' && !localStorageToken) {
        throw new AppError(
          'AUTHENTICATION_EXPIRED',
          `The captured session does not contain ${sessionToken.storage} entry "${sessionToken.name}"`,
          401,
        );
      }
      if (localStorageToken && /[\r\n]/.test(localStorageToken)) {
        throw new AppError('AUTHENTICATION_FAILED', 'The captured session token is invalid', 422);
      }
      const target = new URL(upstreamOrigin);
      const basePath = targetBase.pathname.endsWith('/') ? targetBase.pathname : `${targetBase.pathname}/`;
      target.pathname = dependency
        ? normalizeRequestedSuffix(dependency.targetPath)
        : requestedPath === '/'
          ? basePath
          : `${basePath}${requestedPath.slice(1)}`.replace(/\/+/g, '/');
      target.search = incoming.search;

      const bridgeToken = this.sessionBridge.token(aggregate);
      const baseHeaders = requestHeaders(request, bridgeToken);
      const response = await this.http.fetch(target, {
        method: request.method,
        headers: baseHeaders,
        ...(requestBody(request) ? { body: requestBody(request)! } : {}),
        maxRedirects: 5,
        headersForUrl: (url) => {
          const headers = { ...baseHeaders };
          const cookie = cookieHeader(material, url);
          if (cookie) headers.cookie = cookie;
          if (url.origin === targetBase.origin) {
            Object.assign(headers, material.headers ?? {});
          }
          if (url.origin === upstreamOrigin && localStorageToken) {
            Object.assign(headers, substitutedSessionHeaders(
              request,
              localStorageToken,
              bridgeToken,
              dependency?.sessionHeaders ?? [],
            ));
          }
          return headers;
        },
      });

      if (this.authenticationExpired(response, aggregate)) {
        await this.authentication.markExpired(aggregate.showcase.id);
        throw new AppError('AUTHENTICATION_EXPIRED', 'Showcase authentication has expired', 401);
      }
      await this.repository.recordVisit(aggregate.showcase.id, response.status);
      const contentTypeValue = response.headers['content-type'];
      const contentType = Array.isArray(contentTypeValue) ? contentTypeValue[0] ?? '' : contentTypeValue ?? '';
      const decodedBody = redactJson(await decodedResponseBody(response), dependency);
      const originMap = new Map<string, string>([[
        targetBase.origin,
        this.previewOrigins.origin(aggregate.showcase.slug),
      ]]);
      for (const candidate of aggregate.showcase.dependencies) {
        if (!candidate.targetOrigin || !candidate.originAlias) continue;
        try {
          originMap.set(
            new URL(candidate.targetOrigin).origin,
            this.previewOrigins.origin(aggregate.showcase.slug, candidate.originAlias),
          );
        } catch {
          // Ignore corrupt, unused mappings. A request for one still fails closed in dependencyOrigin.
        }
      }
      const body = rewriteContent(
        decodedBody,
        contentType,
        {
          documentUrl: response.finalUrl,
          originMap,
          sessionToken,
          bridgeToken,
        },
      );
      const mappedOrigins = [...new Set(originMap.values())];
      const sourceList = mappedOrigins.map((origin) => origin.replace(/[;'\s]/g, '')).join(' ');
      const requestOrigin = Array.isArray(request.headers.origin)
        ? request.headers.origin[0]
        : request.headers.origin;
      const allowedCorsOrigin = this.previewOrigins.allowedCorsOrigin(
        requestOrigin,
        aggregate.showcase.slug,
        this.frontendOrigin,
      );
      const headers = {
        ...responseHeaders(response),
        'content-length': String(body.length),
        'cache-control': 'private, no-store',
        pragma: 'no-cache',
        'cross-origin-resource-policy': 'cross-origin',
        'content-security-policy': `default-src 'self' ${sourceList} data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ${sourceList}; frame-ancestors ${this.frontendOrigin}; base-uri 'self'; form-action 'none'; object-src 'none'; worker-src 'none'`,
        'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), clipboard-write=(), fullscreen=()',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      } as Record<string, string | string[]>;
      if (allowedCorsOrigin) {
        headers['access-control-allow-origin'] = allowedCorsOrigin;
        const vary = headers.vary;
        const values = (Array.isArray(vary) ? vary : [vary ?? ''])
          .flatMap((value) => value.split(','))
          .map((value) => value.trim())
          .filter(Boolean);
        if (!values.some((value) => value.toLowerCase() === 'origin')) values.push('Origin');
        headers.vary = values.join(', ');
        if (allowedCorsOrigin !== '*') headers['access-control-allow-credentials'] = 'true';
      }
      if (sessionToken?.storage === 'cookie') {
        headers['set-cookie'] = `${sessionToken.name}=${bridgeToken}; Path=/; SameSite=Lax`;
      }
      return {
        status: response.status,
        headers,
        body,
      };
    } finally {
      release();
    }
  }

  private authenticationExpired(response: SecureHttpResponse, aggregate: ShowcaseAggregate): boolean {
    if (response.status === 401) return true;
    if (response.status === 403 && aggregate.authentication?.config.expireOn403 === true) return true;
    const loginUrl = aggregate.authentication?.config.loginUrl;
    if (typeof loginUrl === 'string') {
      try {
        const login = new URL(loginUrl);
        if (response.finalUrl.origin === login.origin && response.finalUrl.pathname.startsWith(login.pathname)) return true;
      } catch {}
    }
    const marker = aggregate.authentication?.config.unauthenticatedMarker;
    return typeof marker === 'string' && marker.length > 0 && response.body.includes(Buffer.from(marker));
  }
}
