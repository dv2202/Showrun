import { createHash, randomBytes } from 'node:crypto';
import type { CreatorProvider } from '../domain/types.js';
import { AppError } from '../errors.js';
import type { OAuthProfile } from './creator-authentication-service.js';

export interface OAuthProviderConfig {
  clientId?: string;
  clientSecret?: string;
}

export interface OAuthTransaction {
  provider: CreatorProvider;
  state: string;
  verifier: string;
  returnTo: string;
  expiresAt: number;
}

interface OAuthProviders {
  github: OAuthProviderConfig;
  google: OAuthProviderConfig;
}

export class OAuthClient {
  constructor(
    private readonly providers: OAuthProviders,
    private readonly publicApiUrl: string,
  ) {}

  availability(): Record<CreatorProvider, boolean> {
    return {
      github: Boolean(this.providers.github.clientId && this.providers.github.clientSecret),
      google: Boolean(this.providers.google.clientId && this.providers.google.clientSecret),
    };
  }

  begin(provider: CreatorProvider, returnTo: string): { url: string; transaction: OAuthTransaction } {
    const config = this.providerConfig(provider);
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const callback = this.callbackUrl(provider);
    const transaction: OAuthTransaction = {
      provider,
      state,
      verifier,
      returnTo,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    if (provider === 'github') {
      const url = new URL('https://github.com/login/oauth/authorize');
      url.searchParams.set('client_id', config.clientId!);
      url.searchParams.set('redirect_uri', callback);
      url.searchParams.set('scope', 'read:user user:email');
      url.searchParams.set('state', state);
      return { url: url.href, transaction };
    }
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', config.clientId!);
    url.searchParams.set('redirect_uri', callback);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return { url: url.href, transaction };
  }

  async exchange(provider: CreatorProvider, code: string, verifier: string): Promise<OAuthProfile> {
    const config = this.providerConfig(provider);
    const callback = this.callbackUrl(provider);
    if (provider === 'github') {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: callback,
        }),
      });
      const tokenPayload = await this.json<{ access_token?: string }>(tokenResponse);
      if (!tokenPayload.access_token) throw this.oauthFailure();
      const headers = {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${tokenPayload.access_token}`,
        'user-agent': 'Showrun',
        'x-github-api-version': '2022-11-28',
      };
      const profile = await this.json<{
        id?: number;
        email?: string | null;
        name?: string | null;
        login?: string;
        avatar_url?: string | null;
      }>(await fetch('https://api.github.com/user', { headers }));
      let email = profile.email;
      if (!email) {
        const emails = await this.json<Array<{ email: string; primary: boolean; verified: boolean }>>(
          await fetch('https://api.github.com/user/emails', { headers }),
        );
        email = emails.find((item) => item.primary && item.verified)?.email
          ?? emails.find((item) => item.verified)?.email;
      }
      if (!profile.id || !email) throw this.oauthFailure();
      return {
        provider,
        providerAccountId: String(profile.id),
        email,
        name: profile.name ?? profile.login ?? null,
        avatarUrl: profile.avatar_url ?? null,
      };
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId!,
        client_secret: config.clientSecret!,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: callback,
      }),
    });
    const tokenPayload = await this.json<{ access_token?: string }>(tokenResponse);
    if (!tokenPayload.access_token) throw this.oauthFailure();
    const profile = await this.json<{
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    }>(
      await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${tokenPayload.access_token}` },
      }),
    );
    if (!profile.sub || !profile.email || profile.email_verified !== true) throw this.oauthFailure();
    return {
      provider,
      providerAccountId: profile.sub,
      email: profile.email,
      name: profile.name ?? null,
      avatarUrl: profile.picture ?? null,
    };
  }

  private providerConfig(provider: CreatorProvider): Required<OAuthProviderConfig> {
    const config = this.providers[provider];
    if (!config.clientId || !config.clientSecret) {
      throw new AppError('AUTH_PROVIDER_UNAVAILABLE', `${provider === 'github' ? 'GitHub' : 'Google'} login is not configured`, 503);
    }
    return { clientId: config.clientId, clientSecret: config.clientSecret };
  }

  private callbackUrl(provider: CreatorProvider): string {
    return `${this.publicApiUrl.replace(/\/$/, '')}/auth/oauth/${provider}/callback`;
  }

  private async json<T>(response: Response): Promise<T> {
    if (!response.ok) throw this.oauthFailure();
    return response.json() as Promise<T>;
  }

  private oauthFailure(): AppError {
    return new AppError('AUTHENTICATION_FAILED', 'OAuth authentication failed', 401);
  }
}
