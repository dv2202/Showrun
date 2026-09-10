import type {
  AuthenticationConfig,
  AuthenticationProviderKind,
  Showcase,
  ShowcaseAggregate,
  ShowcaseMode,
  ShowcaseRoute,
  ShowcaseState,
  StoredSession,
  User,
} from '../domain/types.js';

export interface CreateShowcaseRecord {
  userId: string;
  slug: string;
  name: string;
  targetUrl: string;
  mode: ShowcaseMode;
  routes: ShowcaseRoute[];
}

export interface SaveAuthenticationRecord {
  showcaseId: string;
  provider: AuthenticationProviderKind;
  config: Record<string, unknown>;
  encryptedSecret: string;
}

export interface ShowcaseRepository {
  ensureUser(id: string, email: string): Promise<User>;
  createShowcase(input: CreateShowcaseRecord): Promise<Showcase>;
  listShowcases(userId: string): Promise<Showcase[]>;
  getShowcaseById(id: string): Promise<ShowcaseAggregate | null>;
  getShowcaseBySlug(slug: string): Promise<ShowcaseAggregate | null>;
  updateShowcase(
    id: string,
    patch: Partial<Pick<Showcase, 'name' | 'slug' | 'targetUrl' | 'mode' | 'routes' | 'state' | 'lastErrorCode'>>,
  ): Promise<Showcase | null>;
  saveAuthentication(input: SaveAuthenticationRecord): Promise<AuthenticationConfig>;
  saveSession(showcaseId: string, encryptedState: string, expiresAt: Date): Promise<StoredSession>;
  deleteSession(showcaseId: string): Promise<void>;
  recordVisit(showcaseId: string, status: number): Promise<void>;
  deleteShowcase(id: string): Promise<boolean>;
  close(): Promise<void>;
}
