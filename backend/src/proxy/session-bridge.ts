import { createHmac } from 'node:crypto';
import type { SessionMaterial, ShowcaseAggregate } from '../domain/types.js';

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function observedSessionHeaders(
  material: SessionMaterial,
  headers: Record<string, string>,
): string[] {
  const values = [
    ...(material.origins ?? []).flatMap((origin) =>
      origin.localStorage.map((item) => item.value)),
    ...(material.sessionOrigins ?? []).flatMap((origin) =>
      origin.sessionStorage.map((item) => item.value)),
  ].filter((value) => value.length >= 8);
  if (!values.length) return [];
  return [...new Set(Object.entries(headers)
    .filter(([, value]) => values.some((token) => value.includes(token)))
    .map(([name]) => name.toLowerCase()))]
    .filter((name) => name !== 'cookie')
    .slice(0, 20);
}

export class SessionBridge {
  constructor(private readonly secret: string) {}

  token(aggregate: ShowcaseAggregate): string {
    if (!aggregate.session) throw new Error('Cannot create a bridge token without a session');
    const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
    const subject = createHmac('sha256', this.secret)
      .update(`${aggregate.showcase.id}:${aggregate.session.id}`)
      .digest('base64url')
      .slice(0, 24);
    const payload = base64UrlJson({
      sub: `showrun-${subject}`,
      exp: Math.floor(aggregate.session.expiresAt.getTime() / 1000),
    });
    const signature = createHmac('sha256', this.secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    return `${header}.${payload}.${signature}`;
  }
}
