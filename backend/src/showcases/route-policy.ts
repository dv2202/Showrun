import { AppError } from '../errors.js';
import type { ShowcaseDependency, ShowcaseRoute } from '../domain/types.js';

function repeatedlyDecode(path: string): string {
  let decoded = path;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch (error) {
      throw new AppError('VALIDATION_ERROR', 'Showcase route path is invalid', 400, { cause: error });
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
  if (/%[0-9a-f]{2}/i.test(decoded)) {
    throw new AppError('VALIDATION_ERROR', 'Showcase route path is invalid', 400);
  }
  return decoded;
}

export function normalizeRoutePath(input: string): string {
  if (!input.startsWith('/') || input.includes('?') || input.includes('#')) {
    throw new AppError('VALIDATION_ERROR', 'Showcase routes must be absolute paths without query strings', 400);
  }
  const decoded = repeatedlyDecode(input);
  if (decoded.includes('\\') || decoded.includes('\0') || /[\u0000-\u001f\u007f]/.test(decoded)) {
    throw new AppError('VALIDATION_ERROR', 'Showcase route path is invalid', 400);
  }
  const segments = decoded.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new AppError('VALIDATION_ERROR', 'Route traversal is not allowed', 400);
  }
  const normalized = `/${segments.filter(Boolean).join('/')}`;
  return normalized === '' ? '/' : normalized;
}

export function normalizeRequestedSuffix(suffix: string): string {
  return normalizeRoutePath(`/${suffix.replace(/^\/+/, '')}`);
}

export function routeIsAllowed(requestedPath: string, routes: ShowcaseRoute[]): boolean {
  const normalized = normalizeRoutePath(requestedPath);
  return routes.some((route) => {
    const allowed = normalizeRoutePath(route.path);
    if (allowed === '/') return normalized === '/';
    return normalized === allowed || normalized.startsWith(`${allowed}/`);
  });
}

export function assertRouteAllowed(requestedPath: string, routes: ShowcaseRoute[]): void {
  if (!routeIsAllowed(requestedPath, routes)) {
    // Deliberately use NOT_FOUND so visitors cannot distinguish unavailable target paths.
    throw new AppError('NOT_FOUND', 'Showcase route not found', 404);
  }
}

export function approvedDependency(
  requestedPath: string,
  search: string,
  dependencies: ShowcaseDependency[],
  originAlias: string | null = null,
): ShowcaseDependency | null {
  const normalized = normalizeRoutePath(requestedPath);
  return dependencies.find((dependency) =>
    dependency.approved &&
    (dependency.originAlias ?? null) === originAlias &&
    normalizeRoutePath(dependency.path) === normalized &&
    dependency.search === search
  ) ?? null;
}

export function assertRequestAllowed(
  requestedPath: string,
  search: string,
  routes: ShowcaseRoute[],
  dependencies: ShowcaseDependency[],
  originAlias: string | null = null,
): ShowcaseDependency | null {
  const dependency = approvedDependency(requestedPath, search, dependencies, originAlias);
  if (dependency) return dependency;
  if (originAlias === null && routeIsAllowed(requestedPath, routes)) return null;
  // Deliberately use NOT_FOUND so visitors cannot distinguish unavailable target paths.
  throw new AppError('NOT_FOUND', 'Showcase route not found', 404);
}
