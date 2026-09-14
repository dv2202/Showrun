import { describe, expect, it } from 'vitest';
import {
  approvedDependency,
  assertRequestAllowed,
  normalizeRoutePath,
  routeIsAllowed,
} from '../src/showcases/route-policy.js';

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

  it('allows only an approved dependency with the exact captured query', () => {
    const dependencies = [{
      path: '/assets/app.js',
      targetPath: '/assets/app.js',
      search: '?v=123',
      contentType: 'application/javascript',
      category: 'script' as const,
      approved: true,
      contentHash: 'hash',
      discoveredAt: new Date().toISOString(),
    }];
    expect(approvedDependency('/assets/app.js', '?v=123', dependencies)).toEqual(dependencies[0]);
    expect(approvedDependency('/assets/app.js', '?v=other', dependencies)).toBeNull();
    expect(approvedDependency('/assets/other.js', '?v=123', dependencies)).toBeNull();
  });

  it('returns exact dependency metadata even when the path is nested under a route', () => {
    const dependency = {
      path: '/projects/api/data',
      targetPath: '/projects/api/data',
      search: '',
      contentType: 'application/json',
      category: 'read_api' as const,
      approved: true,
      sessionHeaders: ['authorization'],
      contentHash: 'hash',
      discoveredAt: new Date().toISOString(),
    };

    expect(assertRequestAllowed('/projects/api/data', '', routes, [dependency])).toBe(dependency);
  });
});
