import type { FastifyRequest } from 'fastify';
import { promisify } from 'node:util';
import { brotliDecompress, gunzip, inflate } from 'node:zlib';
import type { SessionMaterial, ShowcaseAggregate, StorageAuthBridge } from '../domain/types.js';
import { AppError } from '../errors.js';
import { AuthenticationService } from '../auth/authentication-service.js';
import type { ShowcaseRepository } from '../storage/repository.js';
import { rewriteContent } from './content-rewriter.js';
import { SecureHttpClient, type SecureHttpResponse } from './secure-http-client.js';
import { assertRequestAllowed, normalizeRequestedSuffix } from '../showcases/route-policy.js';

const blockedRequestHeaders = new Set([
  'authorization', 'cookie', 'host', 'connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'forwarded',
  'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'content-length',
  'accept-encoding', 'expect', 'proxy-connection', 'origin', 'referer',
]);
const blockedResponseHeaders = new Set([
  'set-cookie', 'authorization', 'proxy-authenticate', 'connection', 'keep-alive',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length', 'content-encoding',
  'content-md5', 'digest', 'etag',
  'content-security-policy', 'content-security-policy-report-only', 'location',
  'content-location', 'refresh', 'link', 'set-cookie2', 'proxy-connection',
  'x-frame-options',
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

function configuredStorageBridge(aggregate: ShowcaseAggregate): StorageAuthBridge | undefined {
  if (aggregate.authentication?.provider !== 'password') return undefined;
  const value = aggregate.authentication.config.storageBridge;
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.storage !== 'localStorage' || typeof candidate.key !== 'string' ||
    !['authorization', 'x-api-key'].includes(String(candidate.headerName)) ||
    (candidate.prefix !== undefined && typeof candidate.prefix !== 'string')) return undefined;
  return {
    storage: 'localStorage',
    key: candidate.key,
    headerName: candidate.headerName as StorageAuthBridge['headerName'],
    prefix: typeof candidate.prefix === 'string' ? candidate.prefix : '',
  };
}

function bridgedStorageValue(
  material: SessionMaterial,
  targetOrigin: string,
  bridge: StorageAuthBridge,
): string | undefined {
  const origin = material.origins?.find((entry) => {
    try {
      return new URL(entry.origin).origin === targetOrigin;
    } catch {
      return false;
    }
  });
  return origin?.localStorage.find((item) => item.name === bridge.key)?.value;
}

function requestHeaders(request: FastifyRequest): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = {};
  const connectionHeaders = new Set(
    (request.headers.connection ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  for (const [key, value] of Object.entries(request.headers)) {
    const lower = key.toLowerCase();
    if (!blockedRequestHeaders.has(lower) && !connectionHeaders.has(lower) &&
      !lower.startsWith('x-forwarded-') && lower !== 'x-real-ip' && value !== undefined) headers[key] = value;
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
    if (!blockedResponseHeaders.has(lower) && !connectionHeaders.has(lower)) headers[key] = value;
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

export class ProxyService {
  private readonly semaphore: Semaphore;

  constructor(
    private readonly repository: ShowcaseRepository,
    private readonly authentication: AuthenticationService,
    private readonly http: SecureHttpClient,
    maximumConcurrency: number,
    private readonly publicProxyPrefix = '/showcase',
  ) {
    this.semaphore = new Semaphore(maximumConcurrency);
  }

  async proxy(aggregate: ShowcaseAggregate, suffix: string, request: FastifyRequest): Promise<ProxyResult> {
    const release = await this.semaphore.acquire();
    try {
      const requestedPath = normalizeRequestedSuffix(suffix);
      const incoming = new URL(request.raw.url ?? '/', 'http://showcase.invalid');
      const dependency = assertRequestAllowed(
        requestedPath,
        incoming.search,
        aggregate.showcase.routes,
        aggregate.showcase.dependencies,
      );
      const material = await this.authentication.activeMaterial(aggregate.showcase.id);
      if (!material) throw new AppError('AUTHENTICATION_EXPIRED', 'Showcase authentication is required', 401);
      const targetBase = new URL(aggregate.showcase.targetUrl);
      const storageBridge = configuredStorageBridge(aggregate);
      const bridgedValue = storageBridge
        ? bridgedStorageValue(material, targetBase.origin, storageBridge)
        : undefined;
      if (storageBridge && !bridgedValue) {
        throw new AppError(
          'AUTHENTICATION_EXPIRED',
          `The captured session does not contain localStorage key "${storageBridge.key}"`,
          401,
        );
      }
      const target = new URL(targetBase);
      const basePath = targetBase.pathname.endsWith('/') ? targetBase.pathname : `${targetBase.pathname}/`;
      target.pathname = dependency
        ? normalizeRequestedSuffix(dependency.targetPath)
        : requestedPath === '/'
          ? basePath
          : `${basePath}${requestedPath.slice(1)}`.replace(/\/+/g, '/');
      target.search = incoming.search;

      const baseHeaders = requestHeaders(request);
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
            if (storageBridge && bridgedValue) {
              headers[storageBridge.headerName] = `${storageBridge.prefix}${bridgedValue}`;
            }
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
      const decodedBody = await decodedResponseBody(response);
      const body = rewriteContent(
        decodedBody,
        contentType,
        response.finalUrl,
        targetBase.origin,
        aggregate.showcase.slug,
        this.publicProxyPrefix,
        storageBridge,
      );
      return {
        status: response.status,
        headers: {
          ...responseHeaders(response),
          'content-length': String(body.length),
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin',
          'content-security-policy': "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'",
        },
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
