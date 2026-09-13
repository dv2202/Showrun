import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';
import type { CreatorProvider } from '../domain/types.js';
import { CreatorAuthenticationService } from '../auth/creator-authentication-service.js';
import { OAuthClient, type OAuthTransaction } from '../auth/oauth-client.js';
import { EncryptionService } from '../security/encryption.js';
import {
  creatorLoginSchema,
  creatorRegistrationSchema,
  oauthCallbackQuerySchema,
  oauthProviderParamsSchema,
  oauthStartQuerySchema,
} from './schemas.js';

const OAUTH_COOKIE = 'showrun_oauth_transaction';

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const pair of header?.split(';') ?? []) {
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    try {
      cookies.set(key, decodeURIComponent(value));
    } catch {
      // Ignore malformed visitor-controlled cookie values.
    }
  }
  return cookies;
}

function serializeCookie(
  name: string,
  value: string,
  options: { maxAge: number; secure: boolean; path?: string },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
    `Path=${options.path ?? '/'}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function safeReturnTo(value: string | undefined): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

function equalState(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function creatorSessionToken(request: FastifyRequest, cookieName: string): string | undefined {
  return parseCookies(request.headers.cookie).get(cookieName);
}

export async function registerCreatorAuthRoutes(
  app: FastifyInstance,
  options: {
    config: AppConfig;
    authentication: CreatorAuthenticationService;
    encryption: EncryptionService;
    oauth: OAuthClient;
  },
): Promise<void> {
  const { config, authentication, encryption, oauth } = options;
  const secure = config.NODE_ENV === 'production';

  const setSession = (reply: FastifyReply, token: string, expiresAt: Date) => {
    reply.header('set-cookie', serializeCookie(config.AUTH_COOKIE_NAME, token, {
      maxAge: (expiresAt.getTime() - Date.now()) / 1000,
      secure,
    }));
  };

  app.get('/api/auth/providers', async () => oauth.availability());

  app.post('/api/auth/email/register', {
    config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = creatorRegistrationSchema.parse(request.body);
    const session = await authentication.register(input.email, input.name, input.password);
    setSession(reply, session.token, session.expiresAt);
    return reply.code(201).send({ user: session.user });
  });

  app.post('/api/auth/email/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = creatorLoginSchema.parse(request.body);
    const session = await authentication.login(input.email, input.password);
    setSession(reply, session.token, session.expiresAt);
    return { user: session.user };
  });

  app.get('/api/auth/session', async (request, reply) => {
    const user = await authentication.authenticate(creatorSessionToken(request, config.AUTH_COOKIE_NAME));
    if (!user) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Unauthenticated' } });
    return { user };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await authentication.logout(creatorSessionToken(request, config.AUTH_COOKIE_NAME));
    reply.header('set-cookie', serializeCookie(config.AUTH_COOKIE_NAME, '', { maxAge: 0, secure }));
    return reply.code(204).send();
  });

  app.get('/api/auth/oauth/:provider', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { provider } = oauthProviderParamsSchema.parse(request.params);
    const query = oauthStartQuerySchema.parse(request.query);
    const { url, transaction } = oauth.begin(provider, safeReturnTo(query.returnTo));
    reply.header('set-cookie', serializeCookie(OAUTH_COOKIE, encryption.encrypt(transaction), {
      maxAge: 10 * 60,
      secure,
    }));
    return reply.redirect(url);
  });

  app.get('/api/auth/oauth/:provider/callback', async (request, reply) => {
    const loginError = (reason: string) => {
      const url = new URL('/login', config.FRONTEND_URL);
      url.searchParams.set('error', reason);
      reply.header('set-cookie', serializeCookie(OAUTH_COOKIE, '', {
        maxAge: 0,
        secure,
      }));
      return reply.redirect(url.href);
    };

    const { provider } = oauthProviderParamsSchema.parse(request.params);
    const query = oauthCallbackQuerySchema.parse(request.query);
    if (query.error || !query.code || !query.state) return loginError('oauth_cancelled');
    const encrypted = parseCookies(request.headers.cookie).get(OAUTH_COOKIE);
    if (!encrypted) return loginError('oauth_state');

    let transaction: OAuthTransaction;
    try {
      transaction = encryption.decrypt<OAuthTransaction>(encrypted);
    } catch {
      return loginError('oauth_state');
    }
    if (
      transaction.provider !== provider
      || transaction.expiresAt <= Date.now()
      || !equalState(transaction.state, query.state)
    ) {
      return loginError('oauth_state');
    }

    try {
      const profile = await oauth.exchange(provider as CreatorProvider, query.code, transaction.verifier);
      const session = await authentication.loginWithOAuth(profile);
      reply.header('set-cookie', [
        serializeCookie(config.AUTH_COOKIE_NAME, session.token, {
          maxAge: (session.expiresAt.getTime() - Date.now()) / 1000,
          secure,
        }),
        serializeCookie(OAUTH_COOKIE, '', {
          maxAge: 0,
          secure,
        }),
      ]);
      return reply.redirect(new URL(safeReturnTo(transaction.returnTo), config.FRONTEND_URL).href);
    } catch {
      return loginError('oauth_failed');
    }
  });
}
