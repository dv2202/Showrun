import { z } from 'zod';

const configRecord = z.record(z.string(), z.unknown());

export const authenticationInputSchema = z.object({
  provider: z.enum(['token', 'password', 'manual_session']),
  config: configRecord,
  secret: z.unknown(),
});

const authenticationUpdateSchema = authenticationInputSchema.extend({
  secret: z.unknown().optional(),
});

const showcaseRouteSchema = z.object({
  path: z.string().min(1).max(500),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(''),
});

const loginVerificationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('expected_url'), url: z.string().url(), match: z.enum(['exact', 'prefix']).optional() }),
  z.object({ type: z.literal('expected_selector'), selector: z.string().min(1).max(500) }),
  z.object({ type: z.literal('authenticated_endpoint'), url: z.string().url(), expectedStatus: z.number().int().min(100).max(599).optional() }),
  z.object({ type: z.literal('absence_of_login_selector'), selector: z.string().min(1).max(500) }),
]);

const storageAuthBridgeSchema = z.object({
  storage: z.literal('localStorage'),
  key: z.string().min(1).max(200).regex(/^[^\x00-\x1f\x7f]+$/),
  headerName: z.enum(['authorization', 'x-api-key']),
  prefix: z.string().max(50).regex(/^[^\r\n]*$/).default(''),
});

const loginConfigurationSchema = z.object({
  loginUrl: z.string().url(),
  usernameSelector: z.string().min(1).max(500),
  passwordSelector: z.string().min(1).max(500),
  submitSelector: z.string().min(1).max(500),
  verification: loginVerificationSchema,
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
  expireOn403: z.boolean().optional(),
  unauthenticatedMarker: z.string().min(1).max(1000).optional(),
  storageBridge: storageAuthBridgeSchema.optional(),
});

export const createShowcaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional(),
  targetUrl: z.string().url(),
  mode: z.enum(['selected_routes', 'full_application']),
  routes: z.array(showcaseRouteSchema).min(1).max(50),
  authentication: authenticationInputSchema.optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  login: loginConfigurationSchema.optional(),
}).superRefine((value, context) => {
  const hasTopLevelPasswordAuth = value.username !== undefined || value.password !== undefined || value.login !== undefined;
  if (hasTopLevelPasswordAuth && (!value.username || !value.password || !value.login)) {
    context.addIssue({ code: 'custom', message: 'username, password, and login configuration must be supplied together' });
  }
  if (hasTopLevelPasswordAuth && value.authentication) {
    context.addIssue({ code: 'custom', message: 'Use either top-level password authentication or authentication, not both' });
  }
}).transform((value) => {
  const { username, password, login, ...showcase } = value;
  if (username && password && login) {
    return {
      ...showcase,
      authentication: {
        provider: 'password' as const,
        config: login,
        secret: { username, password },
      },
    };
  }
  return showcase;
});

export const updateShowcaseSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional(),
  targetUrl: z.string().url().optional(),
  mode: z.enum(['selected_routes', 'full_application']).optional(),
  routes: z.array(showcaseRouteSchema).min(1).max(50).optional(),
  authentication: authenticationUpdateSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const idParamsSchema = z.object({ id: z.string().uuid() });
export const dependencyApprovalsSchema = z.object({
  approvals: z.array(z.object({
    path: z.string().startsWith('/').max(2000),
    search: z.string().max(2000),
    approved: z.boolean(),
  })).max(250),
});
export const slugParamsSchema = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80) });
export const proxyParamsSchema = slugParamsSchema.extend({ '*': z.string().default('') });

export const creatorRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(200),
});

export const creatorLoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

export const oauthProviderParamsSchema = z.object({
  provider: z.enum(['github', 'google']),
});

export const oauthStartQuerySchema = z.object({
  returnTo: z.string().max(500).optional(),
});

export const oauthCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});
