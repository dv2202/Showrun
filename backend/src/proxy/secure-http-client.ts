import { Agent, request, type Dispatcher } from 'undici';
import { AppError } from '../errors.js';
import type { ResolvedAddress } from '../security/target-policy.js';
import { TargetPolicy } from '../security/target-policy.js';

export interface SecureHttpResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
  finalUrl: URL;
}

export interface SecureHttpRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: Buffer;
  maxRedirects?: number;
  headersForUrl?: (url: URL, redirectCount: number) => Record<string, string | string[] | undefined>;
}

function pinnedAgent(hostname: string, address: ResolvedAddress): Agent {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return new Agent({
    connect: {
      lookup(lookupHostname, _options, callback) {
        const requested = lookupHostname.replace(/^\[|\]$/g, '').toLowerCase();
        if (requested !== normalized) {
          callback(new Error('Unexpected hostname during pinned connection'), '', 0);
          return;
        }
        if (typeof _options === 'object' && _options.all) {
          (callback as unknown as (error: null, addresses: ResolvedAddress[]) => void)(null, [address]);
        } else {
          callback(null, address.address, address.family);
        }
      },
    },
  });
}

function responseHeaders(headers: Dispatcher.ResponseData['headers']): Record<string, string | string[]> {
  const output: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) output[key.toLowerCase()] = value;
  }
  return output;
}

async function readLimitedBody(body: Dispatcher.ResponseData['body'], maximum: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const rawChunk of body) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    size += chunk.length;
    if (size > maximum) {
      body.destroy();
      throw new AppError('PROXY_ERROR', 'Target response exceeded the allowed size', 502);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function redirectLocation(headers: Record<string, string | string[]>): string | undefined {
  const value = headers.location;
  return Array.isArray(value) ? value[0] : value;
}

function redirectedMethod(status: number, method: string): string {
  if (status === 303) return 'GET';
  if ((status === 301 || status === 302) && method === 'POST') return 'GET';
  return method;
}

export class SecureHttpClient {
  constructor(
    private readonly policy: TargetPolicy,
    private readonly timeoutMs: number,
    private readonly maxResponseBytes: number,
    private readonly requestFunction: typeof request = request,
  ) {}

  async fetch(input: string | URL, options: SecureHttpRequest = {}): Promise<SecureHttpResponse> {
    let current = input instanceof URL ? new URL(input) : new URL(input);
    let method = (options.method ?? 'GET').toUpperCase();
    let body = options.body;
    const maximumRedirects = options.maxRedirects ?? 5;

    for (let redirectCount = 0; ; redirectCount += 1) {
      const validated = await this.policy.validate(current);
      const selected = validated.addresses[redirectCount % validated.addresses.length]!;
      const dispatcher = pinnedAgent(validated.url.hostname, selected);
      try {
        const dynamicHeaders = options.headersForUrl?.(validated.url, redirectCount);
        const result = await this.requestFunction(validated.url, {
          method: method as Dispatcher.HttpMethod,
          headers: dynamicHeaders ?? options.headers,
          body,
          dispatcher,
          headersTimeout: this.timeoutMs,
          bodyTimeout: this.timeoutMs,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const headers = responseHeaders(result.headers);
        const responseBody = await readLimitedBody(result.body, this.maxResponseBytes);
        const location = redirectLocation(headers);
        if (result.statusCode >= 300 && result.statusCode < 400 && location) {
          const redirectTarget = new URL(location, validated.url);
          // Validate even when redirects are intentionally returned to a browser.
          // This prevents a safe public hop from handing Chromium a private target.
          await this.policy.validate(redirectTarget);
          if (redirectCount >= maximumRedirects) {
            if (maximumRedirects === 0) {
              return { status: result.statusCode, headers, body: responseBody, finalUrl: validated.url };
            }
            throw new AppError('TARGET_UNAVAILABLE', 'Target exceeded the redirect limit', 502);
          }
          current = redirectTarget;
          const nextMethod = redirectedMethod(result.statusCode, method);
          if (nextMethod === 'GET' && method !== 'GET') body = undefined;
          method = nextMethod;
          continue;
        }
        return { status: result.statusCode, headers, body: responseBody, finalUrl: validated.url };
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('TARGET_UNAVAILABLE', 'Target application is unavailable', 502, {
          cause: error,
        });
      } finally {
        await dispatcher.close();
      }
    }
  }
}
