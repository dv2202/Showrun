import { createHash } from 'node:crypto';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const aliasPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function originAliasFor(targetOrigin: string, primaryOrigin: string): string | null {
  if (new URL(targetOrigin).origin === new URL(primaryOrigin).origin) return null;
  return `o-${createHash('sha256').update(new URL(targetOrigin).origin).digest('hex').slice(0, 12)}`;
}

export interface PreviewAddress {
  slug: string;
  originAlias: string | null;
}

export interface PreviewOriginOptions {
  protocol: 'http' | 'https';
  domain: string;
  port: number;
}

function normalizedHost(host: string): string | null {
  if (!host || /[\s/@\\]/.test(host)) return null;
  try {
    return new URL(`http://${host}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

export class PreviewOriginRouter {
  readonly protocol: 'http' | 'https';
  readonly domain: string;
  readonly port: number;

  constructor(options: PreviewOriginOptions) {
    this.protocol = options.protocol;
    this.domain = options.domain.replace(/\.$/, '').toLowerCase();
    this.port = options.port;
  }

  parseHost(hostHeader: string | undefined): PreviewAddress | null {
    if (!hostHeader) return null;
    const hostname = normalizedHost(hostHeader);
    if (!hostname || hostname === this.domain || !hostname.endsWith(`.${this.domain}`)) return null;
    const label = hostname.slice(0, -this.domain.length - 1);
    if (!label || label.includes('.')) return null;
    const delimiter = label.indexOf('--');
    if (delimiter === -1) {
      return slugPattern.test(label) ? { slug: label, originAlias: null } : null;
    }
    if (label.indexOf('--', delimiter + 2) !== -1) return null;
    const originAlias = label.slice(0, delimiter);
    const slug = label.slice(delimiter + 2);
    if (!aliasPattern.test(originAlias) || !slugPattern.test(slug)) return null;
    return { slug, originAlias };
  }

  ownsHost(hostHeader: string | undefined): boolean {
    if (!hostHeader) return false;
    const hostname = normalizedHost(hostHeader);
    return Boolean(hostname && hostname !== this.domain && hostname.endsWith(`.${this.domain}`));
  }

  origin(slug: string, originAlias: string | null = null): string {
    if (!slugPattern.test(slug) || (originAlias !== null && !aliasPattern.test(originAlias))) {
      throw new Error('Invalid preview origin identifier');
    }
    const defaultPort = this.protocol === 'https' ? 443 : 80;
    const port = this.port === defaultPort ? '' : `:${this.port}`;
    const label = originAlias ? `${originAlias}--${slug}` : slug;
    return `${this.protocol}://${label}.${this.domain}${port}`;
  }

  originAlias(targetOrigin: string, primaryOrigin: string): string | null {
    return originAliasFor(targetOrigin, primaryOrigin);
  }

  allowedCorsOrigin(
    originHeader: string | undefined,
    slug: string,
    frontendOrigin: string,
  ): string | null {
    if (!originHeader) return '*';
    let origin: URL;
    try {
      origin = new URL(originHeader);
    } catch {
      return null;
    }
    if (origin.origin === frontendOrigin) return origin.origin;
    const address = this.parseHost(origin.host);
    if (!address || address.slug !== slug) return null;
    return origin.origin === this.origin(address.slug, address.originAlias) ? origin.origin : null;
  }
}
