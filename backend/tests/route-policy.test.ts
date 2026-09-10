import { describe, expect, it } from 'vitest';
import { normalizeRoutePath, routeIsAllowed } from '../src/showcases/route-policy.js';

const routes = [
  { path: '/dashboard', title: 'Dashboard', description: '' },
  { path: '/projects', title: 'Projects', description: '' },
  { path: '/assets', title: 'Assets', description: '' },
];

describe('selected showcase route policy', () => {
  it.each(['/dashboard', '/projects', '/projects/42', '/projects/42/details', '/projects/'])('allows configured route %s', (path) => {
    expect(routeIsAllowed(path, routes)).toBe(true);
  });

  it.each(['/admin', '/project', '/projects-private', '/api/projects', '/'])('blocks unconfigured route %s', (path) => {
    expect(routeIsAllowed(path, routes)).toBe(false);
  });

  it.each([
    '/projects/../admin',
    '/projects/%2e%2e/admin',
    '/projects/%252e%252e/admin',
    '/projects\\..\\admin',
    '/projects/%00/admin',
  ])('rejects traversal or malformed route %s', (path) => {
    expect(() => normalizeRoutePath(path)).toThrow();
  });

  it('does not let a root route implicitly expose every nested route', () => {
    const rootOnly = [{ path: '/', title: 'Home', description: '' }];
    expect(routeIsAllowed('/', rootOnly)).toBe(true);
    expect(routeIsAllowed('/admin', rootOnly)).toBe(false);
  });
});
