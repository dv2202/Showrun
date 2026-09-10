import type { SessionMaterial } from '../domain/types.js';
import { AppError, asAppError } from '../errors.js';
import { EncryptionService } from '../security/encryption.js';
import { PreparationCoordinator } from '../sessions/preparation-coordinator.js';
import type { ShowcaseRepository } from '../storage/repository.js';
import { AuthenticationProviderRegistry } from './providers.js';

export class AuthenticationService {
  private readonly lastPreparationAttempt = new Map<string, number>();
  constructor(
    private readonly repository: ShowcaseRepository,
    private readonly encryption: EncryptionService,
    private readonly providers: AuthenticationProviderRegistry,
    private readonly coordinator: PreparationCoordinator,
    private readonly sessionTtlSeconds: number,
  ) {}

  prepare(showcaseId: string, force = false): Promise<void> {
    return this.coordinator.run(showcaseId, async () => {
      const aggregate = await this.repository.getShowcaseById(showcaseId);
      if (!aggregate) throw new AppError('NOT_FOUND', 'Showcase not found', 404);
      if (!force && aggregate.session?.expiresAt && aggregate.session.expiresAt > new Date()) {
        await this.repository.updateShowcase(showcaseId, { state: 'ACTIVE', lastErrorCode: null });
        return;
      }
      if (!force && aggregate.showcase.state === 'ERROR') {
        throw new AppError('AUTHENTICATION_FAILED', 'Authentication requires creator attention', 409);
      }
      if (!aggregate.authentication) {
        throw new AppError('AUTHENTICATION_FAILED', 'Authentication is not configured', 409);
      }
      const previousAttempt = this.lastPreparationAttempt.get(showcaseId) ?? 0;
      if (!force && Date.now() - previousAttempt < 30_000) {
        throw new AppError('CONFLICT', 'Authentication retry is temporarily unavailable', 409);
      }
      this.lastPreparationAttempt.set(showcaseId, Date.now());

      await this.repository.updateShowcase(showcaseId, { state: 'PREPARING', lastErrorCode: null });
      try {
        const secret = this.encryption.decrypt<unknown>(aggregate.authentication.encryptedSecret);
        const provider = this.providers.get(aggregate.authentication.provider);
        const material = await provider.authenticate(aggregate.authentication.config, secret);
        const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);
        await this.repository.saveSession(showcaseId, this.encryption.encrypt(material), expiresAt);
        await this.repository.updateShowcase(showcaseId, { state: 'ACTIVE', lastErrorCode: null });
      } catch (error) {
        const original = asAppError(error);
        const appError = original.code === 'PROXY_ERROR'
          ? new AppError('AUTHENTICATION_FAILED', 'Authentication could not be completed', 422, { cause: error })
          : original;
        await this.repository.deleteSession(showcaseId);
        await this.repository.updateShowcase(showcaseId, {
          state: 'ERROR',
          lastErrorCode: appError.code === 'PROXY_ERROR' ? 'AUTHENTICATION_FAILED' : appError.code,
        });
        if (appError.code === 'AUTHENTICATION_FAILED') throw appError;
        throw new AppError('AUTHENTICATION_FAILED', 'Authentication could not be completed', 422, {
          cause: appError,
        });
      }
    });
  }

  async activeMaterial(showcaseId: string): Promise<SessionMaterial | null> {
    const aggregate = await this.repository.getShowcaseById(showcaseId);
    if (!aggregate?.session) return null;
    if (aggregate.session.expiresAt <= new Date()) {
      await this.markExpired(showcaseId);
      return null;
    }
    return this.encryption.decrypt<SessionMaterial>(aggregate.session.encryptedState);
  }

  async hasActiveSession(showcaseId: string): Promise<boolean> {
    return (await this.activeMaterial(showcaseId)) !== null;
  }

  async reauthenticate(showcaseId: string): Promise<void> {
    await this.repository.deleteSession(showcaseId);
    return this.prepare(showcaseId, true);
  }

  async markExpired(showcaseId: string): Promise<void> {
    await this.repository.deleteSession(showcaseId);
    await this.repository.updateShowcase(showcaseId, {
      state: 'AUTHENTICATION_EXPIRED',
      lastErrorCode: 'AUTHENTICATION_EXPIRED',
    });
  }
}
