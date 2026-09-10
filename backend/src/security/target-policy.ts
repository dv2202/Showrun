import { lookup as dnsLookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { AppError } from '../errors.js';

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface ValidatedTarget {
  url: URL;
  addresses: ResolvedAddress[];
}

export type DnsResolver = (hostname: string) => Promise<ResolvedAddress[]>;

const forbiddenHostnames = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  '169.254.169.254',
  '100.100.100.200',
]);

function normalizedHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
}

export function isPublicAddress(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return false;
  }

  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }

  return parsed.range() === 'unicast';
}

const defaultResolver: DnsResolver = async (hostname) => {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
};

export class TargetPolicy {
  constructor(private readonly resolve: DnsResolver = defaultResolver) {}

  async validate(input: string | URL): Promise<ValidatedTarget> {
    let url: URL;
    try {
      url = input instanceof URL ? new URL(input) : new URL(input);
    } catch (error) {
      throw new AppError('INVALID_TARGET', 'Target URL is invalid', 400, { cause: error });
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new AppError('INVALID_TARGET', 'Only HTTP and HTTPS targets are supported', 400);
    }
    if (url.username || url.password) {
      throw new AppError('INVALID_TARGET', 'Target URLs cannot contain credentials', 400);
    }

    const hostname = normalizedHostname(url.hostname);
    if (!hostname || forbiddenHostnames.has(hostname) || hostname.endsWith('.localhost')) {
      throw new AppError('SSRF_BLOCKED', 'Target destination is not allowed', 400);
    }

    let addresses: ResolvedAddress[];
    if (ipaddr.isValid(hostname)) {
      const parsed = ipaddr.parse(hostname);
      addresses = [{ address: parsed.toString(), family: parsed.kind() === 'ipv4' ? 4 : 6 }];
    } else {
      try {
        addresses = await this.resolve(hostname);
      } catch (error) {
        throw new AppError('TARGET_UNAVAILABLE', 'Target hostname could not be resolved', 502, {
          cause: error,
        });
      }
    }

    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
      throw new AppError('SSRF_BLOCKED', 'Target destination is not allowed', 400);
    }

    url.hostname = hostname;
    url.hash = '';
    return { url, addresses };
  }
}
