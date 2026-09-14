import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticationService } from '../auth/authentication-service.js';
import { AppError, asAppError } from '../errors.js';
import type { PreviewAddress, PreviewOriginRouter } from '../proxy/preview-origin.js';
import type { ProxyService } from '../proxy/proxy-service.js';
import { assertRequestAllowed, normalizeRequestedSuffix } from '../showcases/route-policy.js';
import type { ShowcaseRepository } from '../storage/repository.js';

export interface PreviewGatewayOptions {
  repository: ShowcaseRepository;
  authentication: AuthenticationService;
  proxy: ProxyService;
  origins: PreviewOriginRouter;
  frontendOrigin: string;
}

export function registerPreviewGateway(
  app: FastifyInstance,
  options: PreviewGatewayOptions,
): void {
  const { repository, authentication, proxy, origins, frontendOrigin } = options;

  const applyCorsHeaders = (
    request: FastifyRequest,
    reply: FastifyReply,
    address: PreviewAddress,
  ) => {
    const originHeader = Array.isArray(request.headers.origin)
      ? request.headers.origin[0]
      : request.headers.origin;
    const allowedOrigin = origins.allowedCorsOrigin(originHeader, address.slug, frontendOrigin);
    if (!allowedOrigin) return;
    reply.header('access-control-allow-origin', allowedOrigin);
    reply.header('vary', 'Origin');
    if (allowedOrigin !== '*') reply.header('access-control-allow-credentials', 'true');
  };

  const requestDetails = (request: FastifyRequest) => {
    const incoming = new URL(request.raw.url ?? '/', 'http://preview.invalid');
    return { incoming, path: normalizeRequestedSuffix(incoming.pathname) };
  };

  const assertAllowed = async (request: FastifyRequest, address: PreviewAddress) => {
    const aggregate = await repository.getShowcaseBySlug(address.slug);
    if (!aggregate) throw new AppError('NOT_FOUND', 'Showcase not found', 404);
    const { incoming, path } = requestDetails(request);
    assertRequestAllowed(
      path,
      incoming.search,
      aggregate.showcase.routes,
      aggregate.showcase.dependencies,
      address.originAlias,
    );
    return { aggregate, incoming };
  };

  const preflight = async (
    request: FastifyRequest,
    reply: FastifyReply,
    address: PreviewAddress,
  ) => {
    await assertAllowed(request, address);
    const requestedHeaderValue = request.headers['access-control-request-headers'];
    const requestedHeaders = (Array.isArray(requestedHeaderValue)
      ? requestedHeaderValue.join(',')
      : requestedHeaderValue ?? '')
      .split(',')
      .map((header) => header.trim().toLowerCase())
      .filter((header) => /^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(header))
      .filter((header) => !['cookie', 'host', 'connection', 'content-length'].includes(header));
    applyCorsHeaders(request, reply, address);
    return reply.headers({
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': requestedHeaders.join(', ') || 'content-type',
      'access-control-max-age': '600',
    }).code(204).send();
  };

  const serve = async (
    request: FastifyRequest,
    reply: FastifyReply,
    address: PreviewAddress,
  ) => {
    applyCorsHeaders(request, reply, address);
    if (request.method === 'OPTIONS') return preflight(request, reply, address);
    if (!['GET', 'HEAD'].includes(request.method)) {
      await assertAllowed(request, address);
      return reply.code(405).send({
        error: { code: 'UNSUPPORTED_APPLICATION', message: 'Showcases are read-only' },
      });
    }
    const { aggregate, incoming } = await assertAllowed(request, address);
    if (!(await authentication.hasActiveSession(aggregate.showcase.id))) {
      if (aggregate.authentication && aggregate.showcase.state !== 'ERROR') {
        void authentication.prepare(aggregate.showcase.id).catch((error) => {
          request.log.warn({ code: asAppError(error).code }, 'Showcase preparation failed');
        });
        return reply.code(202).send({ status: 'preparing' });
      }
      return reply.code(401).send({
        status: aggregate.showcase.state === 'ERROR' ? 'error' : 'auth_required',
      });
    }
    const refreshed = await repository.getShowcaseById(aggregate.showcase.id);
    const result = await proxy.proxy(refreshed!, incoming.pathname, request, address.originAlias);
    for (const [key, value] of Object.entries(result.headers)) reply.header(key, value);
    return reply.code(result.status).send(result.body);
  };

  app.addHook('onRequest', async (request, reply) => {
    const host = Array.isArray(request.headers.host) ? request.headers.host[0] : request.headers.host;
    const address = origins.parseHost(host);
    if (address) return serve(request, reply, address);
    if (origins.ownsHost(host)) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Showcase not found' } });
    }
  });
}
