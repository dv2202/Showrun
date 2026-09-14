import { describe, expect, it } from 'vitest';
import { PreviewOriginRouter } from '../src/proxy/preview-origin.js';

describe('isolated preview origins', () => {
  const router = new PreviewOriginRouter({ protocol: 'http', domain: 'localhost', port: 4000 });

  it('builds and parses primary and opaque auxiliary hosts', () => {
    expect(router.origin('billing-demo')).toBe('http://billing-demo.localhost:4000');
    expect(router.origin('billing-demo', 'o-abc123')).toBe(
      'http://o-abc123--billing-demo.localhost:4000',
    );
    expect(router.parseHost('billing-demo.localhost:4000')).toEqual({
      slug: 'billing-demo',
      originAlias: null,
    });
    expect(router.parseHost('o-abc123--billing-demo.localhost:4000')).toEqual({
      slug: 'billing-demo',
      originAlias: 'o-abc123',
    });
  });

  it('rejects malformed, nested, and unrelated hosts', () => {
    expect(router.parseHost('localhost:4000')).toBeNull();
    expect(router.parseHost('admin.billing-demo.localhost:4000')).toBeNull();
    expect(router.parseHost('bad--alias--billing-demo.localhost:4000')).toBeNull();
    expect(router.parseHost('billing-demo.example.com')).toBeNull();
    expect(router.ownsHost('admin.billing-demo.localhost:4000')).toBe(true);
  });

  it('uses stable opaque aliases without exposing the upstream hostname', () => {
    const alias = router.originAlias('https://private-api.example', 'https://app.example');
    expect(alias).toMatch(/^o-[a-f0-9]{12}$/);
    expect(alias).not.toContain('private-api');
    expect(router.originAlias('https://app.example', 'https://app.example')).toBeNull();
  });

  it('allows CORS only from the dashboard and sibling origins for the same showcase', () => {
    expect(router.allowedCorsOrigin(
      'http://localhost:3000', 'billing-demo', 'http://localhost:3000',
    )).toBe('http://localhost:3000');
    expect(router.allowedCorsOrigin(
      'http://o-abc123--billing-demo.localhost:4000',
      'billing-demo',
      'http://localhost:3000',
    )).toBe('http://o-abc123--billing-demo.localhost:4000');
    expect(router.allowedCorsOrigin(
      'http://other-demo.localhost:4000', 'billing-demo', 'http://localhost:3000',
    )).toBeNull();
    expect(router.allowedCorsOrigin(
      'https://attacker.example', 'billing-demo', 'http://localhost:3000',
    )).toBeNull();
  });
});
