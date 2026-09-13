import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { AppConfig } from '../config.js';
import { AppError, asAppError } from '../errors.js';
import { EncryptionService } from '../security/encryption.js';
import { TargetPolicy } from '../security/target-policy.js';
import type { ShowcaseRepository } from '../storage/repository.js';
import { PostgresShowcaseRepository } from '../storage/postgres-repository.js';
import { PreparationCoordinator } from '../sessions/preparation-coordinator.js';
import { SecureHttpClient } from '../proxy/secure-http-client.js';
import { PlaywrightBootstrapper } from '../browser/playwright-bootstrapper.js';
import {
  AuthenticationProviderRegistry,
  ManualSessionProvider,
  PasswordAuthProvider,
  TokenAuthProvider,
  type AuthenticationProvider,
} from '../auth/providers.js';
import { AuthenticationService } from '../auth/authentication-service.js';
import { CreatorAuthenticationService } from '../auth/creator-authentication-service.js';
import { OAuthClient } from '../auth/oauth-client.js';
import { ShowcaseService, publicShowcaseStatus } from '../showcases/showcase-service.js';
import { ProxyService } from '../proxy/proxy-service.js';
import { assertRouteAllowed, normalizeRequestedSuffix } from '../showcases/route-policy.js';
import { pinoRedactPaths } from '../security/redaction.js';
import {
  createShowcaseSchema,
  idParamsSchema,
  proxyParamsSchema,
  slugParamsSchema,
  updateShowcaseSchema,
} from './schemas.js';
import { creatorSessionToken, registerCreatorAuthRoutes } from './creator-auth-routes.js';

export interface BuildAppOptions {
  config: AppConfig;
  repository?: ShowcaseRepository;
  policy?: TargetPolicy;
  http?: SecureHttpClient;
  providers?: AuthenticationProvider[];
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : {
      level: config.LOG_LEVEL,
      redact: { paths: pinoRedactPaths, censor: '[REDACTED]' },
    },
    bodyLimit: 1_048_576,
    requestTimeout: 30_000,
    keepAliveTimeout: 5_000,
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

  const repository = options.repository ?? new PostgresShowcaseRepository(config.DATABASE_URL);
  const policy = options.policy ?? new TargetPolicy();
  const encryption = new EncryptionService(config.ENCRYPTION_KEY);
  const http = options.http ?? new SecureHttpClient(policy, config.PROXY_TIMEOUT_MS, config.PROXY_MAX_RESPONSE_BYTES);
  const browser = new PlaywrightBootstrapper(
    policy,
    http,
    config.PLAYWRIGHT_HEADLESS === 'true',
    config.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  );
  const providers = new AuthenticationProviderRegistry(options.providers ?? [
    new TokenAuthProvider(),
    new PasswordAuthProvider(browser),
    new ManualSessionProvider(),
  ]);
  const authentication = new AuthenticationService(
    repository,
    encryption,
    providers,
    new PreparationCoordinator(),
    config.SESSION_TTL_SECONDS,
  );
  const showcases = new ShowcaseService(repository, policy, encryption);
  const creatorAuthentication = new CreatorAuthenticationService(
    repository,
    config.AUTH_SESSION_TTL_SECONDS,
  );
  const oauth = new OAuthClient({
    github: { clientId: config.GITHUB_CLIENT_ID, clientSecret: config.GITHUB_CLIENT_SECRET },
    google: { clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET },
  }, config.AUTH_PUBLIC_API_URL);
  const proxy = new ProxyService(
    repository,
    authentication,
    http,
    config.PROXY_MAX_CONCURRENCY,
    config.SHOWCASE_PUBLIC_PROXY_PREFIX,
  );
  app.addHook('onClose', async () => repository.close());

  app.setErrorHandler(async (error, request, reply) => {
    let appError: AppError;
    if (error instanceof ZodError) {
      appError = new AppError('VALIDATION_ERROR', 'Request validation failed', 400, { cause: error });
    } else {
      appError = asAppError(error);
    }
    request.log.error({ code: appError.code, err: error }, appError.publicMessage);
    await reply.code(appError.statusCode).send({
      error: { code: appError.code, message: appError.publicMessage },
    });
  });

  await registerCreatorAuthRoutes(app, {
    config,
    authentication: creatorAuthentication,
    encryption,
    oauth,
  });

  await app.register(async (admin) => {
    const creatorIds = new WeakMap<FastifyRequest, string>();
    admin.addHook('onRequest', async (request, reply) => {
      const creator = await creatorAuthentication.authenticate(
        creatorSessionToken(request, config.AUTH_COOKIE_NAME),
      );
      if (!creator) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      }
      creatorIds.set(request, creator.id);
    });
    const creatorId = (request: FastifyRequest) => creatorIds.get(request)!;

    admin.post('/api/showcases', async (request, reply) => {
      const result = await showcases.create(createShowcaseSchema.parse(request.body), creatorId(request));
      return reply.code(201).send(result);
    });
    admin.get('/api/showcases', async (request) => showcases.list(creatorId(request)));
    admin.get('/api/showcases/:id', async (request) => {
      const { id } = idParamsSchema.parse(request.params);
      return showcases.get(id, creatorId(request));
    });
    admin.patch('/api/showcases/:id', async (request) => {
      const { id } = idParamsSchema.parse(request.params);
      return showcases.update(id, updateShowcaseSchema.parse(request.body), creatorId(request));
    });
    admin.delete('/api/showcases/:id', async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      await showcases.delete(id, creatorId(request));
      return reply.code(204).send();
    });
    admin.post('/api/showcases/:id/prepare', async (request) => {
      const { id } = idParamsSchema.parse(request.params);
      await showcases.get(id, creatorId(request));
      await authentication.prepare(id, true);
      return showcases.get(id, creatorId(request));
    });
    admin.post('/api/showcases/:id/authenticate', async (request) => {
      const { id } = idParamsSchema.parse(request.params);
      await showcases.get(id, creatorId(request));
      await authentication.prepare(id, true);
      return showcases.get(id, creatorId(request));
    });
    admin.post('/api/showcases/:id/re-authenticate', async (request) => {
      const { id } = idParamsSchema.parse(request.params);
      await showcases.get(id, creatorId(request));
      await authentication.reauthenticate(id);
      return showcases.get(id, creatorId(request));
    });
  });

  const statusHandler = async (request: FastifyRequest) => {
    const { slug } = slugParamsSchema.parse(request.params);
    const aggregate = await repository.getShowcaseBySlug(slug);
    if (!aggregate) throw new AppError('NOT_FOUND', 'Showcase not found', 404);
    const active = await authentication.hasActiveSession(aggregate.showcase.id);
    const refreshed = await repository.getShowcaseById(aggregate.showcase.id);
    return publicShowcaseStatus(refreshed!.showcase, active);
  };
  app.get('/api/showcases/:slug/status', statusHandler);
  app.get('/showcase/:slug/status', statusHandler);

  const proxyHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = proxyParamsSchema.parse(request.params);
    const aggregate = await repository.getShowcaseBySlug(parsed.slug);
    if (!aggregate) throw new AppError('NOT_FOUND', 'Showcase not found', 404);
    const requestedPath = normalizeRequestedSuffix(parsed['*']);
    assertRouteAllowed(requestedPath, aggregate.showcase.routes);
    if (!(await authentication.hasActiveSession(aggregate.showcase.id))) {
      if (aggregate.authentication && aggregate.showcase.state !== 'ERROR') {
        void authentication.prepare(aggregate.showcase.id).catch((error) => {
          request.log.warn({ code: asAppError(error).code }, 'Showcase preparation failed');
        });
        return reply.code(202).send({ status: 'preparing' });
      }
      return reply.code(401).send({ status: aggregate.showcase.state === 'ERROR' ? 'error' : 'auth_required' });
    }
    const refreshed = await repository.getShowcaseById(aggregate.showcase.id);
    const result = await proxy.proxy(refreshed!, parsed['*'], request);
    for (const [key, value] of Object.entries(result.headers)) reply.header(key, value);
    return reply.code(result.status).send(result.body);
  };
  app.route({ method: ['GET', 'HEAD'], url: '/showcase/:slug', handler: proxyHandler });
  app.route({ method: ['GET', 'HEAD'], url: '/showcase/:slug/*', handler: proxyHandler });
  const readOnlyHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = proxyParamsSchema.parse(request.params);
    const aggregate = await repository.getShowcaseBySlug(parsed.slug);
    if (!aggregate) throw new AppError('NOT_FOUND', 'Showcase not found', 404);
    assertRouteAllowed(normalizeRequestedSuffix(parsed['*']), aggregate.showcase.routes);
    return reply.code(405).send({ error: { code: 'UNSUPPORTED_APPLICATION', message: 'Showcases are read-only' } });
  };
  app.route({ method: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: '/showcase/:slug', handler: readOnlyHandler });
  app.route({ method: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: '/showcase/:slug/*', handler: readOnlyHandler });

  return app;
}
