import { randomUUID } from 'node:crypto';
import { Pool, type QueryResultRow } from 'pg';
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

type DbShowcase = QueryResultRow & {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  target_url: string;
  mode: Showcase['mode'];
  routes: Showcase['routes'];
  dependencies: Showcase['dependencies'];
  state: Showcase['state'];
  last_error_code: string | null;
  created_at: Date;
  updated_at: Date;
};

type DbAuthentication = QueryResultRow & {
  id: string;
  showcase_id: string;
  provider: AuthenticationConfig['provider'];
  config: Record<string, unknown>;
  encrypted_secret: string;
  created_at: Date;
  updated_at: Date;
};

type DbSession = QueryResultRow & {
  id: string;
  showcase_id: string;
  encrypted_state: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
};

type DbUser = QueryResultRow & {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  password_hash: string | null;
  created_at: Date;
};

function toUser(row: DbUser): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

function toShowcase(row: DbShowcase): Showcase {
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    name: row.name,
    targetUrl: row.target_url,
    mode: row.mode,
    routes: row.routes,
    dependencies: row.dependencies,
    state: row.state,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAuthentication(row: DbAuthentication): AuthenticationConfig {
  return {
    id: row.id,
    showcaseId: row.showcase_id,
    provider: row.provider,
    config: row.config,
    encryptedSecret: row.encrypted_secret,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSession(row: DbSession): StoredSession {
  return {
    id: row.id,
    showcaseId: row.showcase_id,
    encryptedState: row.encrypted_state,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresShowcaseRepository implements ShowcaseRepository {
  readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  }

  async createPasswordUser(email: string, name: string, passwordHash: string): Promise<User | null> {
    const result = await this.pool.query<DbUser>(
      `INSERT INTO users (id, email, name, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING
       RETURNING *`,
      [randomUUID(), email, name, passwordHash],
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query<DbUser>('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  async upsertOAuthUser(input: {
    provider: CreatorProvider;
    providerAccountId: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  }): Promise<User> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const account = await client.query<{ user_id: string }>(
        'SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_account_id = $2 FOR UPDATE',
        [input.provider, input.providerAccountId],
      );
      let userResult;
      if (account.rows[0]) {
        userResult = await client.query<DbUser>(
          `UPDATE users SET
             name = COALESCE($2, name),
             avatar_url = COALESCE($3, avatar_url)
           WHERE id = $1 RETURNING *`,
          [account.rows[0].user_id, input.name, input.avatarUrl],
        );
      } else {
        userResult = await client.query<DbUser>(
          `INSERT INTO users (id, email, name, avatar_url)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO UPDATE SET
             name = COALESCE(EXCLUDED.name, users.name),
             avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url)
           RETURNING *`,
          [randomUUID(), input.email, input.name, input.avatarUrl],
        );
        await client.query(
          `INSERT INTO oauth_accounts (provider, provider_account_id, user_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (provider, provider_account_id) DO UPDATE SET
             user_id = EXCLUDED.user_id,
             updated_at = now()`,
          [input.provider, input.providerAccountId, userResult.rows[0]!.id],
        );
      }
      await client.query('COMMIT');
      return toUser(userResult.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createCreatorSession(tokenHash: string, userId: string, expiresAt: Date): Promise<CreatorSession> {
    const result = await this.pool.query<CreatorSession & QueryResultRow>(
      `INSERT INTO creator_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, $3)
       RETURNING token_hash AS "tokenHash", user_id AS "userId", expires_at AS "expiresAt", created_at AS "createdAt"`,
      [tokenHash, userId, expiresAt],
    );
    return result.rows[0]!;
  }

  async getUserByCreatorSession(tokenHash: string, now: Date): Promise<User | null> {
    const result = await this.pool.query<DbUser>(
      `SELECT u.* FROM creator_sessions cs
       JOIN users u ON u.id = cs.user_id
       WHERE cs.token_hash = $1 AND cs.expires_at > $2`,
      [tokenHash, now],
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  async deleteCreatorSession(tokenHash: string): Promise<void> {
    await this.pool.query('DELETE FROM creator_sessions WHERE token_hash = $1', [tokenHash]);
  }

  async createShowcase(input: CreateShowcaseRecord): Promise<Showcase> {
    const result = await this.pool.query<DbShowcase>(
      `INSERT INTO showcases (id, user_id, slug, name, target_url, mode, routes, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'CREATED') RETURNING *`,
      [randomUUID(), input.userId, input.slug, input.name, input.targetUrl, input.mode, JSON.stringify(input.routes)],
    );
    return toShowcase(result.rows[0]!);
  }

  async listShowcases(userId: string): Promise<Showcase[]> {
    const result = await this.pool.query<DbShowcase>(
      'SELECT * FROM showcases WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return result.rows.map(toShowcase);
  }

  async getShowcaseById(id: string): Promise<ShowcaseAggregate | null> {
    return this.getAggregate('s.id', id);
  }

  async getShowcaseBySlug(slug: string): Promise<ShowcaseAggregate | null> {
    return this.getAggregate('s.slug', slug);
  }

  private async getAggregate(column: 's.id' | 's.slug', value: string): Promise<ShowcaseAggregate | null> {
    const showcaseResult = await this.pool.query<DbShowcase>(`SELECT s.* FROM showcases s WHERE ${column} = $1`, [value]);
    const showcaseRow = showcaseResult.rows[0];
    if (!showcaseRow) return null;
    const [authenticationResult, sessionResult] = await Promise.all([
      this.pool.query<DbAuthentication>('SELECT * FROM authentication_configs WHERE showcase_id = $1', [showcaseRow.id]),
      this.pool.query<DbSession>('SELECT * FROM sessions WHERE showcase_id = $1', [showcaseRow.id]),
    ]);
    return {
      showcase: toShowcase(showcaseRow),
      authentication: authenticationResult.rows[0] ? toAuthentication(authenticationResult.rows[0]) : null,
      session: sessionResult.rows[0] ? toSession(sessionResult.rows[0]) : null,
    };
  }

  async updateShowcase(
    id: string,
    patch: Partial<Pick<Showcase, 'name' | 'slug' | 'targetUrl' | 'mode' | 'routes' | 'dependencies' | 'state' | 'lastErrorCode'>>,
  ): Promise<Showcase | null> {
    const columns: string[] = [];
    const values: unknown[] = [];
    const mapping: Array<[keyof typeof patch, string]> = [
      ['name', 'name'],
      ['slug', 'slug'],
      ['targetUrl', 'target_url'],
      ['mode', 'mode'],
      ['routes', 'routes'],
      ['dependencies', 'dependencies'],
      ['state', 'state'],
      ['lastErrorCode', 'last_error_code'],
    ];
    for (const [key, column] of mapping) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        values.push(key === 'routes' || key === 'dependencies' ? JSON.stringify(patch[key]) : patch[key]);
        columns.push(`${column} = $${values.length}`);
      }
    }
    if (columns.length === 0) return (await this.getShowcaseById(id))?.showcase ?? null;
    values.push(id);
    const result = await this.pool.query<DbShowcase>(
      `UPDATE showcases SET ${columns.join(', ')}, updated_at = now()
       WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return result.rows[0] ? toShowcase(result.rows[0]) : null;
  }

  async saveAuthentication(input: SaveAuthenticationRecord): Promise<AuthenticationConfig> {
    const result = await this.pool.query<DbAuthentication>(
      `INSERT INTO authentication_configs
         (id, showcase_id, provider, config, encrypted_secret)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (showcase_id) DO UPDATE SET
         provider = EXCLUDED.provider,
         config = EXCLUDED.config,
         encrypted_secret = EXCLUDED.encrypted_secret,
         updated_at = now()
       RETURNING *`,
      [randomUUID(), input.showcaseId, input.provider, input.config, input.encryptedSecret],
    );
    return toAuthentication(result.rows[0]!);
  }

  async saveSession(showcaseId: string, encryptedState: string, expiresAt: Date): Promise<StoredSession> {
    const result = await this.pool.query<DbSession>(
      `INSERT INTO sessions (id, showcase_id, encrypted_state, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (showcase_id) DO UPDATE SET
         encrypted_state = EXCLUDED.encrypted_state,
         expires_at = EXCLUDED.expires_at,
         updated_at = now()
       RETURNING *`,
      [randomUUID(), showcaseId, encryptedState, expiresAt],
    );
    return toSession(result.rows[0]!);
  }

  async deleteSession(showcaseId: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE showcase_id = $1', [showcaseId]);
  }

  async recordVisit(showcaseId: string, status: number): Promise<void> {
    await this.pool.query(
      'INSERT INTO showcase_visits (id, showcase_id, status) VALUES ($1, $2, $3)',
      [randomUUID(), showcaseId, status],
    );
  }

  async deleteShowcase(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM showcases WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
