import { randomUUID } from 'node:crypto';
import type {
  AuthenticationConfig,
  Showcase,
  ShowcaseAggregate,
  StoredSession,
  User,
  CreatorProvider,
  CreatorSession,
} from '../domain/types.js';
import type {
  CreateShowcaseRecord,
  SaveAuthenticationRecord,
  ShowcaseRepository,
} from './repository.js';

export class MemoryShowcaseRepository implements ShowcaseRepository {
  private readonly users = new Map<string, User>();
  private readonly showcases = new Map<string, Showcase>();
  private readonly authentications = new Map<string, AuthenticationConfig>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly creatorSessions = new Map<string, CreatorSession>();
  private readonly oauthAccounts = new Map<string, string>();
  readonly visits: Array<{ showcaseId: string; status: number }> = [];

  async createPasswordUser(email: string, name: string, passwordHash: string): Promise<User | null> {
    if ([...this.users.values()].some((user) => user.email === email)) return null;
    const user: User = {
      id: randomUUID(),
      email,
      name,
      avatarUrl: null,
      passwordHash,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async upsertOAuthUser(input: {
    provider: CreatorProvider;
    providerAccountId: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  }): Promise<User> {
    const accountKey = `${input.provider}:${input.providerAccountId}`;
    const accountUserId = this.oauthAccounts.get(accountKey);
    const existing = accountUserId
      ? this.users.get(accountUserId)
      : [...this.users.values()].find((user) => user.email === input.email);
    const user: User = existing
      ? { ...existing, name: input.name ?? existing.name, avatarUrl: input.avatarUrl ?? existing.avatarUrl }
      : {
          id: randomUUID(),
          email: input.email,
          name: input.name,
          avatarUrl: input.avatarUrl,
          passwordHash: null,
          createdAt: new Date(),
        };
    this.users.set(user.id, user);
    this.oauthAccounts.set(accountKey, user.id);
    return user;
  }

  async createCreatorSession(tokenHash: string, userId: string, expiresAt: Date): Promise<CreatorSession> {
    const session = { tokenHash, userId, expiresAt, createdAt: new Date() };
    this.creatorSessions.set(tokenHash, session);
    return session;
  }

  async getUserByCreatorSession(tokenHash: string, now: Date): Promise<User | null> {
    const session = this.creatorSessions.get(tokenHash);
    if (!session || session.expiresAt <= now) {
      if (session) this.creatorSessions.delete(tokenHash);
      return null;
    }
    return this.users.get(session.userId) ?? null;
  }

  async deleteCreatorSession(tokenHash: string): Promise<void> {
    this.creatorSessions.delete(tokenHash);
  }

  async createShowcase(input: CreateShowcaseRecord): Promise<Showcase> {
    if ([...this.showcases.values()].some(({ slug }) => slug === input.slug)) {
      throw new Error('duplicate slug');
    }
    const now = new Date();
    const showcase: Showcase = {
      id: randomUUID(),
      ...input,
      dependencies: input.dependencies ?? [],
      state: 'CREATED',
      lastErrorCode: null,
      createdAt: now,
      updatedAt: now,
    };
    this.showcases.set(showcase.id, showcase);
    return showcase;
  }

  async listShowcases(userId: string): Promise<Showcase[]> {
    return [...this.showcases.values()].filter((item) => item.userId === userId);
  }

  async getShowcaseById(id: string): Promise<ShowcaseAggregate | null> {
    const showcase = this.showcases.get(id);
    return showcase ? this.aggregate(showcase) : null;
  }

  async getShowcaseBySlug(slug: string): Promise<ShowcaseAggregate | null> {
    const showcase = [...this.showcases.values()].find((item) => item.slug === slug);
    return showcase ? this.aggregate(showcase) : null;
  }

  async updateShowcase(
    id: string,
    patch: Partial<Pick<Showcase, 'name' | 'slug' | 'targetUrl' | 'mode' | 'routes' | 'dependencies' | 'state' | 'lastErrorCode'>>,
  ): Promise<Showcase | null> {
    const existing = this.showcases.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date() };
    this.showcases.set(id, updated);
    return updated;
  }

  async saveAuthentication(input: SaveAuthenticationRecord): Promise<AuthenticationConfig> {
    const existing = this.authentications.get(input.showcaseId);
    const now = new Date();
    const authentication: AuthenticationConfig = {
      id: existing?.id ?? randomUUID(),
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.authentications.set(input.showcaseId, authentication);
    return authentication;
  }

  async saveSession(showcaseId: string, encryptedState: string, expiresAt: Date): Promise<StoredSession> {
    const existing = this.sessions.get(showcaseId);
    const now = new Date();
    const session: StoredSession = {
      id: existing?.id ?? randomUUID(),
      showcaseId,
      encryptedState,
      expiresAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.sessions.set(showcaseId, session);
    return session;
  }

  async deleteSession(showcaseId: string): Promise<void> {
    this.sessions.delete(showcaseId);
  }

  async recordVisit(showcaseId: string, status: number): Promise<void> {
    this.visits.push({ showcaseId, status });
  }

  async deleteShowcase(id: string): Promise<boolean> {
    this.authentications.delete(id);
    this.sessions.delete(id);
    for (let index = this.visits.length - 1; index >= 0; index -= 1) {
      if (this.visits[index]?.showcaseId === id) this.visits.splice(index, 1);
    }
    return this.showcases.delete(id);
  }

  async close(): Promise<void> {}

  private aggregate(showcase: Showcase): ShowcaseAggregate {
    return {
      showcase,
      authentication: this.authentications.get(showcase.id) ?? null,
      session: this.sessions.get(showcase.id) ?? null,
    };
  }
}
