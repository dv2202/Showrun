import { z } from 'zod';
import type { AuthenticationProviderKind, SessionMaterial } from '../domain/types.js';
import { AppError } from '../errors.js';
import { PlaywrightBootstrapper } from '../browser/playwright-bootstrapper.js';

export interface AuthenticationProvider {
  readonly kind: AuthenticationProviderKind;
  authenticate(config: Record<string, unknown>, secret: unknown): Promise<SessionMaterial>;
}

const verificationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('expected_url'), url: z.string().url(), match: z.enum(['exact', 'prefix']).optional() }),
  z.object({ type: z.literal('expected_selector'), selector: z.string().min(1).max(500) }),
  z.object({ type: z.literal('authenticated_endpoint'), url: z.string().url(), expectedStatus: z.number().int().min(100).max(599).optional() }),
  z.object({ type: z.literal('absence_of_login_selector'), selector: z.string().min(1).max(500) }),
]);

const sessionTokenLocationSchema = z.object({
  storage: z.enum(['cookie', 'localStorage', 'sessionStorage']),
  name: z.string().min(1).max(200).regex(/^[^\x00-\x1f\x7f;,]+$/),
});

const passwordConfigSchema = z.object({
  loginUrl: z.string().url(),
  usernameSelector: z.string().min(1).max(500),
  passwordSelector: z.string().min(1).max(500),
  submitSelector: z.string().min(1).max(500),
  verification: verificationSchema,
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
  sessionToken: sessionTokenLocationSchema.optional(),
});
const passwordSecretSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export class PasswordAuthProvider implements AuthenticationProvider {
  readonly kind = 'password' as const;
  constructor(private readonly browser: PlaywrightBootstrapper) {}

  async authenticate(config: Record<string, unknown>, secret: unknown): Promise<SessionMaterial> {
    const parsedConfig = passwordConfigSchema.parse(config);
    const parsedSecret = passwordSecretSchema.parse(secret);
    const material = await this.browser.authenticate(parsedConfig, parsedSecret);
    if (parsedConfig.sessionToken) {
      const { storage, name } = parsedConfig.sessionToken;
      const captured = storage === 'cookie'
        ? material.cookies?.some((cookie) => cookie.name === name && cookie.value.length > 0)
        : storage === 'localStorage' ? material.origins?.some((origin) =>
          origin.localStorage.some((item) => item.name === name && item.value.length > 0),
        ) : material.sessionOrigins?.some((origin) =>
          origin.sessionStorage.some((item) => item.name === name && item.value.length > 0),
        );
      if (!captured) {
        throw new AppError(
          'AUTHENTICATION_FAILED',
          `Login succeeded, but ${storage} entry "${name}" was not found`,
          422,
        );
      }
    }
    return material;
  }
}

const tokenConfigSchema = z.object({
  headerName: z.enum(['authorization', 'x-api-key']),
  prefix: z.string().max(50).regex(/^[^\r\n]*$/).optional(),
});
const tokenSecretSchema = z.object({ token: z.string().min(1).regex(/^[^\r\n]*$/) });

export class TokenAuthProvider implements AuthenticationProvider {
  readonly kind = 'token' as const;

  async authenticate(config: Record<string, unknown>, secret: unknown): Promise<SessionMaterial> {
    const parsedConfig = tokenConfigSchema.parse(config);
    const parsedSecret = tokenSecretSchema.parse(secret);
    return {
      headers: {
        [parsedConfig.headerName]: `${parsedConfig.prefix ?? ''}${parsedSecret.token}`,
      },
    };
  }
}

const storageStateSchema = z.object({
  cookies: z.array(z.object({
    name: z.string().regex(/^[^\x00-\x20\x7f()<>@,;:\\"/[\]?={}]+$/),
    value: z.string().regex(/^[^\r\n]*$/),
    domain: z.string().regex(/^[^\r\n]*$/),
    path: z.string().regex(/^\/[^\r\n]*$/),
    expires: z.number(),
    httpOnly: z.boolean(), secure: z.boolean(), sameSite: z.enum(['Strict', 'Lax', 'None']),
  })).default([]),
  origins: z.array(z.object({
    origin: z.string().url(),
    localStorage: z.array(z.object({ name: z.string(), value: z.string() })),
  })).default([]),
});

export class ManualSessionProvider implements AuthenticationProvider {
  readonly kind = 'manual_session' as const;

  async authenticate(_config: Record<string, unknown>, secret: unknown): Promise<SessionMaterial> {
    const value = z.object({ storageState: storageStateSchema }).safeParse(secret);
    if (!value.success) {
      throw new AppError('AUTHENTICATION_FAILED', 'Manual session data is invalid', 422);
    }
    return value.data.storageState;
  }
}

export class AuthenticationProviderRegistry {
  private readonly providers: Map<AuthenticationProviderKind, AuthenticationProvider>;

  constructor(providers: AuthenticationProvider[]) {
    this.providers = new Map(providers.map((provider) => [provider.kind, provider]));
  }

  get(kind: AuthenticationProviderKind): AuthenticationProvider {
    const provider = this.providers.get(kind);
    if (!provider) throw new AppError('AUTHENTICATION_FAILED', 'Authentication method is unavailable', 422);
    return provider;
  }
}
