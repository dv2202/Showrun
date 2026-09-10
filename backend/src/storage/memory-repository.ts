import { randomUUID } from 'node:crypto';
import type {
  AuthenticationConfig,
  Showcase,
  ShowcaseAggregate,
  StoredSession,
  User,
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
  readonly visits: Array<{ showcaseId: string; status: number }> = [];

  async ensureUser(id: string, email: string): Promise<User> {
    const existing = this.users.get(id);
    if (existing) return existing;
    const user = { id, email, createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }

  async createShowcase(input: CreateShowcaseRecord): Promise<Showcase> {
    if ([...this.showcases.values()].some(({ slug }) => slug === input.slug)) {
      throw new Error('duplicate slug');
    }
    const now = new Date();
    const showcase: Showcase = {
      id: randomUUID(),
      ...input,
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
    patch: Partial<Pick<Showcase, 'name' | 'slug' | 'targetUrl' | 'mode' | 'routes' | 'state' | 'lastErrorCode'>>,
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
