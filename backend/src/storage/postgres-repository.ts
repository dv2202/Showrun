import { randomUUID } from 'node:crypto';
import { Pool, type QueryResultRow } from 'pg';
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

type DbShowcase = QueryResultRow & {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  target_url: string;
  mode: Showcase['mode'];
  routes: Showcase['routes'];
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

function toShowcase(row: DbShowcase): Showcase {
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    name: row.name,
    targetUrl: row.target_url,
    mode: row.mode,
    routes: row.routes,
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

  async ensureUser(id: string, email: string): Promise<User> {
    const inserted = await this.pool.query<{ id: string; email: string; created_at: Date }>(
      `INSERT INTO users (id, email) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING
       RETURNING id, email, created_at`,
      [id, email],
    );
    const result = inserted.rows[0]
      ? inserted
      : await this.pool.query<{ id: string; email: string; created_at: Date }>(
        'SELECT id, email, created_at FROM users WHERE id = $1',
        [id],
      );
    const row = result.rows[0]!;
    return { id: row.id, email: row.email, createdAt: row.created_at };
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
    patch: Partial<Pick<Showcase, 'name' | 'slug' | 'targetUrl' | 'mode' | 'routes' | 'state' | 'lastErrorCode'>>,
  ): Promise<Showcase | null> {
    const columns: string[] = [];
    const values: unknown[] = [];
    const mapping: Array<[keyof typeof patch, string]> = [
      ['name', 'name'],
      ['slug', 'slug'],
      ['targetUrl', 'target_url'],
      ['mode', 'mode'],
      ['routes', 'routes'],
      ['state', 'state'],
      ['lastErrorCode', 'last_error_code'],
    ];
    for (const [key, column] of mapping) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        values.push(key === 'routes' ? JSON.stringify(patch[key]) : patch[key]);
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
