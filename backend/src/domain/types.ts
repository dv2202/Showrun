export const showcaseStates = [
  'CREATED',
  'PREPARING',
  'ACTIVE',
  'AUTHENTICATION_EXPIRED',
  'ERROR',
] as const;

export type ShowcaseState = (typeof showcaseStates)[number];
export type AuthenticationProviderKind = 'token' | 'password' | 'manual_session';
export type ShowcaseMode = 'selected_routes' | 'full_application';
export type CreatorProvider = 'github' | 'google';

export interface ShowcaseRoute {
  path: string;
  title: string;
  description: string;
}

export type VerificationStrategy =
  | { type: 'expected_url'; url: string; match?: 'exact' | 'prefix' }
  | { type: 'expected_selector'; selector: string }
  | { type: 'authenticated_endpoint'; url: string; expectedStatus?: number }
  | { type: 'absence_of_login_selector'; selector: string };

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  passwordHash: string | null;
  createdAt: Date;
}

export interface CreatorSession {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface Showcase {
  id: string;
  userId: string;
  slug: string;
  name: string;
  targetUrl: string;
  mode: ShowcaseMode;
  routes: ShowcaseRoute[];
  state: ShowcaseState;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticationConfig {
  id: string;
  showcaseId: string;
  provider: AuthenticationProviderKind;
  config: Record<string, unknown>;
  encryptedSecret: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredSession {
  id: string;
  showcaseId: string;
  encryptedState: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShowcaseVisit {
  id: string;
  showcaseId: string;
  status: number;
  createdAt: Date;
}

export interface SessionMaterial {
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins?: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
  headers?: Record<string, string>;
}

export interface ShowcaseAggregate {
  showcase: Showcase;
  authentication: AuthenticationConfig | null;
  session: StoredSession | null;
}
