import { randomBytes } from 'node:crypto';
import { AppError } from '../errors.js';
import type {
  AuthenticationConfig,
  AuthenticationProviderKind,
  Showcase,
  ShowcaseDependency,
  ShowcaseRoute,
} from '../domain/types.js';
import { EncryptionService } from '../security/encryption.js';
import { TargetPolicy } from '../security/target-policy.js';
import type { ShowcaseRepository } from '../storage/repository.js';
import { normalizeRoutePath } from './route-policy.js';
import { PreviewOriginRouter } from '../proxy/preview-origin.js';

export interface AuthenticationInput {
  provider: AuthenticationProviderKind;
  config: Record<string, unknown>;
  secret: unknown;
}

export interface CreateShowcaseInput {
  name: string;
  targetUrl: string;
  mode: 'selected_routes' | 'full_application';
  routes: ShowcaseRoute[];
  slug?: string;
  authentication?: AuthenticationInput;
}

export interface UpdateShowcaseInput {
  name?: string;
  slug?: string;
  targetUrl?: string;
  mode?: 'selected_routes' | 'full_application';
  routes?: ShowcaseRoute[];
  authentication?: Omit<AuthenticationInput, 'secret'> & { secret?: unknown };
}

function editableAuthenticationConfig(authentication: AuthenticationConfig | null) {
  if (authentication?.provider !== 'password') return null;
  const source = authentication.config;
  const config: Record<string, unknown> = {};
  for (const key of [
    'loginUrl',
    'usernameSelector',
    'passwordSelector',
    'submitSelector',
    'timeoutMs',
    'expireOn403',
    'unauthenticatedMarker',
    'sessionToken',
  ]) {
    if (source[key] !== undefined) config[key] = source[key];
  }
  const verification = source.verification;
  if (verification && typeof verification === 'object' && 'type' in verification) {
    const safeVerification: Record<string, unknown> = { type: verification.type };
    for (const key of ['selector', 'url', 'match', 'expectedStatus']) {
      if (key in verification) safeVerification[key] = verification[key as keyof typeof verification];
    }
    config.verification = safeVerification;
  }
  return config;
}

export function creatorShowcase(
  showcase: Showcase,
  authentication: AuthenticationConfig | null,
  publicUrl: string,
) {
  return {
    id: showcase.id,
    name: showcase.name,
    slug: showcase.slug,
    publicUrl,
    targetUrl: showcase.targetUrl,
    mode: showcase.mode,
    routes: showcase.routes,
    dependencies: showcase.dependencies,
    state: showcase.state,
    lastErrorCode: showcase.lastErrorCode,
    authenticationConfigured: authentication !== null,
    authenticationProvider: authentication?.provider ?? null,
    authenticationConfig: editableAuthenticationConfig(authentication),
    createdAt: showcase.createdAt,
    updatedAt: showcase.updatedAt,
  };
}

export type PublicStatus = 'preparing' | 'ready' | 'auth_required' | 'error';

export function publicShowcaseStatus(showcase: Showcase, hasValidSession: boolean, publicUrl: string) {
  let status: PublicStatus;
  if (showcase.state === 'PREPARING') status = 'preparing';
  else if (showcase.state === 'ACTIVE' && hasValidSession) status = 'ready';
  else if (showcase.state === 'ERROR') status = 'error';
  else status = 'auth_required';
  return {
    name: showcase.name,
    slug: showcase.slug,
    publicUrl,
    status,
    mode: showcase.mode,
    routes: showcase.routes,
  };
}

export class ShowcaseService {
  constructor(
    private readonly repository: ShowcaseRepository,
    private readonly policy: TargetPolicy,
    private readonly encryption: EncryptionService,
    private readonly previewOrigins: PreviewOriginRouter,
  ) {}

  async create(input: CreateShowcaseInput, userId: string) {
    const validated = await this.policy.validate(input.targetUrl);
    await this.validateAuthenticationUrls(input.authentication);
    const routes = this.normalizeRoutes(input.routes);
    let showcase: Showcase | undefined;
    const requestedSlug = input.slug;
    for (let attempt = 0; attempt < (requestedSlug ? 1 : 5); attempt += 1) {
      try {
        showcase = await this.repository.createShowcase({
          userId,
          name: input.name,
          slug: requestedSlug ?? this.generateSlug(input.name),
          targetUrl: validated.url.href,
          mode: input.mode,
          routes,
        });
        break;
      } catch (error) {
        if (requestedSlug || attempt === 4) {
          throw new AppError('CONFLICT', 'A showcase with that slug already exists', 409, { cause: error });
        }
      }
    }
    if (!showcase) throw new AppError('CONFLICT', 'A showcase slug could not be generated', 409);
    if (input.authentication) await this.configureAuthentication(showcase.id, input.authentication);
    return this.get(showcase.id, userId);
  }

  async list(userId: string) {
    const showcases = await this.repository.listShowcases(userId);
    return Promise.all(showcases.map(async (showcase) => {
      const aggregate = await this.repository.getShowcaseById(showcase.id);
      return creatorShowcase(
        showcase,
        aggregate?.authentication ?? null,
        this.previewOrigins.origin(showcase.slug),
      );
    }));
  }

  async get(id: string, userId: string) {
    const aggregate = await this.repository.getShowcaseById(id);
    if (!aggregate || aggregate.showcase.userId !== userId) {
      throw new AppError('NOT_FOUND', 'Showcase not found', 404);
    }
    return creatorShowcase(
      aggregate.showcase,
      aggregate.authentication ?? null,
      this.previewOrigins.origin(aggregate.showcase.slug),
    );
  }

  async update(id: string, input: UpdateShowcaseInput, userId: string) {
    const aggregate = await this.repository.getShowcaseById(id);
    if (!aggregate || aggregate.showcase.userId !== userId) {
      throw new AppError('NOT_FOUND', 'Showcase not found', 404);
    }
    await this.validateAuthenticationUrls(input.authentication);
    const patch: Parameters<ShowcaseRepository['updateShowcase']>[1] = {};
    let invalidateSession = false;
    if (input.name !== undefined) patch.name = input.name;
    if (input.slug !== undefined) patch.slug = input.slug;
    if (input.targetUrl !== undefined) {
      patch.targetUrl = (await this.policy.validate(input.targetUrl)).url.href;
      patch.state = 'CREATED';
      patch.lastErrorCode = null;
      patch.dependencies = [];
      invalidateSession = true;
    }
    if (input.mode !== undefined) patch.mode = input.mode;
    if (input.routes !== undefined) {
      patch.routes = this.normalizeRoutes(input.routes);
      patch.dependencies = [];
    }
    try {
      await this.repository.updateShowcase(id, patch);
      if (input.authentication) {
        await this.updateAuthentication(id, input.authentication, aggregate.authentication);
        invalidateSession = true;
        await this.repository.updateShowcase(id, {
          dependencies: [],
          state: 'CREATED',
          lastErrorCode: null,
        });
      }
      if (invalidateSession) await this.repository.deleteSession(id);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('CONFLICT', 'The showcase could not be updated', 409, { cause: error });
    }
    return this.get(id, userId);
  }

  async replaceDependencies(id: string, dependencies: ShowcaseDependency[], userId: string) {
    const aggregate = await this.repository.getShowcaseById(id);
    if (!aggregate || aggregate.showcase.userId !== userId) {
      throw new AppError('NOT_FOUND', 'Showcase not found', 404);
    }
    const previousApprovals = new Map(
      aggregate.showcase.dependencies
        .filter((dependency) => dependency.approved)
        .map((dependency) => [
          `${dependency.originAlias ?? ''}\u0000${dependency.path}\u0000${dependency.search}`,
          dependency.redactedFields ?? [],
        ]),
    );
    const merged = dependencies.map((dependency) => {
      const key = `${dependency.originAlias ?? ''}\u0000${dependency.path}\u0000${dependency.search}`;
      const previousRedactions = previousApprovals.get(key);
      return {
        ...dependency,
        approved: dependency.approved || previousRedactions !== undefined,
        redactedFields: previousRedactions ?? dependency.redactedFields ?? [],
      };
    });
    await this.repository.updateShowcase(id, { dependencies: merged });
    return this.get(id, userId);
  }

  async updateDependencyApprovals(
    id: string,
    approvals: Array<{
      path: string;
      search: string;
      originAlias?: string | null;
      approved: boolean;
      redactedFields?: string[];
    }>,
    userId: string,
  ) {
    const aggregate = await this.repository.getShowcaseById(id);
    if (!aggregate || aggregate.showcase.userId !== userId) {
      throw new AppError('NOT_FOUND', 'Showcase not found', 404);
    }
    const decisions = new Map(
      approvals.map((approval) => [
        `${approval.originAlias ?? ''}\u0000${approval.path}\u0000${approval.search}`,
        { approved: approval.approved, redactedFields: approval.redactedFields ?? [] },
      ]),
    );
    const dependencies = aggregate.showcase.dependencies.map((dependency) => {
      const decision = decisions.get(`${dependency.originAlias ?? ''}\u0000${dependency.path}\u0000${dependency.search}`);
      return decision === undefined ? dependency : { ...dependency, ...decision };
    });
    await this.repository.updateShowcase(id, { dependencies });
    return this.get(id, userId);
  }

  async delete(id: string, userId: string): Promise<void> {
    const aggregate = await this.repository.getShowcaseById(id);
    if (!aggregate || aggregate.showcase.userId !== userId) {
      throw new AppError('NOT_FOUND', 'Showcase not found', 404);
    }
    await this.repository.deleteShowcase(id);
  }

  private normalizeRoutes(routes: ShowcaseRoute[]): ShowcaseRoute[] {
    const seen = new Set<string>();
    return routes.map((route) => {
      const path = normalizeRoutePath(route.path);
      if (seen.has(path)) throw new AppError('VALIDATION_ERROR', `Duplicate showcase route: ${path}`, 400);
      seen.add(path);
      return { path, title: route.title.trim(), description: route.description.trim() };
    });
  }

  private generateSlug(name: string): string {
    const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'showcase';
    return `${base}-${randomBytes(4).toString('hex')}`;
  }

  private async configureAuthentication(showcaseId: string, authentication: AuthenticationInput): Promise<void> {
    this.assertNoPlaintextSecrets(authentication.config);
    await this.repository.saveAuthentication({
      showcaseId,
      provider: authentication.provider,
      config: authentication.config,
      encryptedSecret: this.encryption.encrypt(authentication.secret),
    });
  }

  private async updateAuthentication(
    showcaseId: string,
    authentication: Omit<AuthenticationInput, 'secret'> & { secret?: unknown },
    existing: AuthenticationConfig | null,
  ): Promise<void> {
    this.assertNoPlaintextSecrets(authentication.config);
    if (authentication.secret === undefined && (!existing || existing.provider !== authentication.provider)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Credentials are required when configuring a new authentication provider',
        400,
      );
    }
    await this.repository.saveAuthentication({
      showcaseId,
      provider: authentication.provider,
      config: authentication.config,
      encryptedSecret:
        authentication.secret === undefined
          ? existing!.encryptedSecret
          : this.encryption.encrypt(authentication.secret),
    });
  }

  private async validateAuthenticationUrls(
    authentication?: Pick<AuthenticationInput, 'provider' | 'config'>,
  ): Promise<void> {
    if (!authentication) return;
    this.assertNoPlaintextSecrets(authentication.config);
    if (authentication.provider !== 'password') return;
    const loginUrl = authentication.config.loginUrl;
    if (typeof loginUrl !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'Password authentication requires a login URL', 400);
    }
    await this.policy.validate(loginUrl);
    const verification = authentication.config.verification;
    if (verification && typeof verification === 'object' && 'type' in verification &&
      verification.type === 'authenticated_endpoint' && 'url' in verification && typeof verification.url === 'string') {
      await this.policy.validate(verification.url);
    }
  }

  private assertNoPlaintextSecrets(config: Record<string, unknown>): void {
    const forbidden = /^(authorization|cookie|credentials|password|passcode|secret|storageState|token|username)$/i;
    const inspect = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(inspect);
      if (!value || typeof value !== 'object') return false;
      return Object.entries(value).some(([key, item]) => forbidden.test(key) || inspect(item));
    };
    if (inspect(config)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Authentication secrets must be supplied only in the encrypted secret field',
        400,
      );
    }
  }
}
