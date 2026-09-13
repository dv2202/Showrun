import {
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { AppError } from '../errors.js';
import type { CreatorProvider, User } from '../domain/types.js';
import type { ShowcaseRepository } from '../storage/repository.js';

const scrypt = promisify(nodeScrypt);
const PASSWORD_SCHEME = 'scrypt-v1';
const PASSWORD_BYTES = 64;

export interface PublicCreator {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface OAuthProfile {
  provider: CreatorProvider;
  providerAccountId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface IssuedCreatorSession {
  token: string;
  expiresAt: Date;
  user: PublicCreator;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sessionHash(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export function publicCreator(user: User): PublicCreator {
  return {
    id: user.id,
    email: user.email,
    name: user.name?.trim() || user.email.split('@')[0] || 'Creator',
    avatarUrl: user.avatarUrl,
  };
}

export class CreatorAuthenticationService {
  constructor(
    private readonly repository: ShowcaseRepository,
    private readonly sessionTtlSeconds: number,
  ) {}

  async register(email: string, name: string, password: string): Promise<IssuedCreatorSession> {
    const passwordHash = await this.hashPassword(password);
    const user = await this.repository.createPasswordUser(
      normalizeEmail(email),
      name.trim(),
      passwordHash,
    );
    if (!user) {
      throw new AppError('CONFLICT', 'An account with this email already exists', 409);
    }
    return this.issue(user);
  }

  async login(email: string, password: string): Promise<IssuedCreatorSession> {
    const user = await this.repository.findUserByEmail(normalizeEmail(email));
    const valid = await this.verifyPassword(password, user?.passwordHash ?? null);
    if (!user || !valid) {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password', 401);
    }
    return this.issue(user);
  }

  async loginWithOAuth(profile: OAuthProfile): Promise<IssuedCreatorSession> {
    const user = await this.repository.upsertOAuthUser({
      ...profile,
      email: normalizeEmail(profile.email),
    });
    return this.issue(user);
  }

  async authenticate(token: string | undefined): Promise<PublicCreator | null> {
    if (!token) return null;
    const user = await this.repository.getUserByCreatorSession(sessionHash(token), new Date());
    return user ? publicCreator(user) : null;
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.repository.deleteCreatorSession(sessionHash(token));
  }

  private async issue(user: User): Promise<IssuedCreatorSession> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);
    await this.repository.createCreatorSession(sessionHash(token), user.id, expiresAt);
    return { token, expiresAt, user: publicCreator(user) };
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = (await scrypt(password, salt, PASSWORD_BYTES)) as Buffer;
    return `${PASSWORD_SCHEME}.${salt.toString('base64url')}.${derived.toString('base64url')}`;
  }

  private async verifyPassword(password: string, stored: string | null): Promise<boolean> {
    const fallbackSalt = Buffer.alloc(16, 0);
    const parts = stored?.split('.') ?? [];
    const validEncoding = parts.length === 3 && parts[0] === PASSWORD_SCHEME;
    const salt = validEncoding ? Buffer.from(parts[1]!, 'base64url') : fallbackSalt;
    const expected = validEncoding ? Buffer.from(parts[2]!, 'base64url') : Buffer.alloc(PASSWORD_BYTES);
    const derived = (await scrypt(password, salt, PASSWORD_BYTES)) as Buffer;
    const matches = expected.length === derived.length && timingSafeEqual(expected, derived);
    return validEncoding && matches;
  }
}
