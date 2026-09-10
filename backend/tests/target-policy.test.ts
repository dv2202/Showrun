import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { TargetPolicy } from '../src/security/target-policy.js';
import { SecureHttpClient } from '../src/proxy/secure-http-client.js';

describe('TargetPolicy SSRF defenses', () => {
  const blocked = [
    'http://localhost',
    'http://127.0.0.1',
    'http://127.0.0.1:3000',
    'http://169.254.169.254',
    'http://10.0.0.1',
    'http://172.16.0.1',
    'http://192.168.1.1',
    'http://0.0.0.0',
    'http://100.64.0.1',
    'http://198.18.0.1',
    'http://224.0.0.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://[::1]',
    'http://[::]',
    'http://[fc00::1]',
    'http://[fe80::1]',
    'http://[ff02::1]',
    'http://[::ffff:127.0.0.1]',
  ];

  it.each(blocked)('blocks %s', async (url) => {
    await expect(new TargetPolicy().validate(url)).rejects.toMatchObject({ code: 'SSRF_BLOCKED' });
  });

  it('blocks DNS names if any answer is private', async () => {
    const policy = new TargetPolicy(async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.9', family: 4 },
    ]);
    await expect(policy.validate('https://rebind.test')).rejects.toMatchObject({ code: 'SSRF_BLOCKED' });
  });

  it.each(['file:///etc/passwd', 'ftp://example.com/file', 'gopher://example.com'])('rejects unsupported protocol %s', async (url) => {
    await expect(new TargetPolicy().validate(url)).rejects.toMatchObject({ code: 'INVALID_TARGET' });
  });

  it.each(['http://127.0.0.1/private', 'http://localhost/private'])('validates and blocks redirect target %s', async (location) => {
    const policy = new TargetPolicy(async () => [{ address: '93.184.216.34', family: 4 }]);
    const request = vi.fn(async () => ({
      statusCode: 302,
      headers: { location },
      body: Readable.from([]),
    })) as never;
    const client = new SecureHttpClient(policy, 1000, 1024, request);
    await expect(client.fetch('https://public.test/start')).rejects.toMatchObject({ code: 'SSRF_BLOCKED' });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
