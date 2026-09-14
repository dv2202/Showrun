# Showcase Platform backend

A TypeScript/Fastify modular monolith for securely bootstrapping authenticated target sessions and serving explicitly selected, read-only target routes through a server-side proxy. Playwright is used only for password-login bootstrap; it is closed immediately after encrypted session state is stored and is not used for normal visitor traffic.

Open [`docs/backend-flow.html`](docs/backend-flow.html) in a browser for an interactive, animated graph of creation, automatic login, proxy traffic, route blocking, and session expiry.

## Architecture

- `src/api`: creator and public HTTP endpoints
- `src/showcases`: showcase configuration and safe DTOs
- `src/auth`: provider abstraction (`token`, `password`, `manual_session`) and lifecycle orchestration
- `src/browser`: isolated Playwright bootstrap with all HTTP traffic routed through the SSRF-safe client
- `src/sessions`: per-showcase single-flight preparation lock
- `src/proxy`: pinned-DNS upstream client, server-side auth attachment, response filtering, and HTML/CSS rewriting
- `src/security`: AES-256-GCM encryption, log redaction, URL/DNS/IP policy
- `src/storage`: PostgreSQL and in-memory test repositories
- `migrations`: PostgreSQL schema for `User`, `Showcase`, `AuthenticationConfig`, `Session`, and `ShowcaseVisit`

## Setup

Requirements: Node.js 22+ and PostgreSQL. `npm install` automatically installs the Playwright-managed
Chromium build for the current operating system.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run build
npm start
```

Production deployments should build `backend/Dockerfile`. It installs the Chromium version matching
`package-lock.json` together with the required Linux libraries and runs the API as the non-root
`node` user. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` is only an optional override for exceptional
environments; normal local and container execution uses Playwright's managed browser automatically.

Generate `ENCRYPTION_KEY` with `openssl rand -base64 32` and keep it in a secret manager, never source control. Terminate TLS at a trusted ingress; creator credentials must never cross plaintext transport.

Creator management endpoints require an opaque, HttpOnly session cookie issued by the creator authentication routes below. Each showcase is owned by the authenticated creator account.

## API

Creator-only:

- `POST /api/auth/email/register`
- `POST /api/auth/email/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/auth/providers`
- `GET /api/auth/oauth/github`
- `GET /api/auth/oauth/github/callback`
- `GET /api/auth/oauth/google`
- `GET /api/auth/oauth/google/callback`

- `POST /api/showcases`
- `GET /api/showcases`
- `GET /api/showcases/:id`
- `PATCH /api/showcases/:id`
- `DELETE /api/showcases/:id`
- `POST /api/showcases/:id/prepare`
- `POST /api/showcases/:id/authenticate`
- `POST /api/showcases/:id/re-authenticate`
- `GET /api/showcases/:id/session-diagnostics`
- `POST /api/showcases/:id/scan-dependencies`
- `PATCH /api/showcases/:id/dependencies`
- `POST /api/showcases/:id/compatibility-test`

Public:

- `GET /api/showcases/:slug/status` (also `/showcase/:slug/status`)
- `GET|HEAD http://:slug.localhost:4000/*` in local development
- `GET|HEAD /showcase/:slug` and `/showcase/:slug/*` redirect to the isolated origin while the legacy path fallback is enabled

The browser viewer uses an isolated origin rather than a path prefix. With the default local configuration,
the dashboard is `http://localhost:3000`, the API is `http://127.0.0.1:4000`, and a preview is
`http://<slug>.localhost:4000`. Root-relative application requests such as `/api/session` therefore return
to the showcase proxy instead of accidentally reaching Next.js. No domain purchase or `/etc/hosts` entry is
needed for Chromium development. Production must use a separate registrable preview domain so dashboard
cookies cannot be shared with untrusted target code.

At deployment time, configure wildcard DNS and TLS for `*.<SHOWCASE_PREVIEW_DOMAIN>`, route that
wildcard host directly to the backend, and preserve the original `Host` header. Set the preview port
to `443` with `SHOWCASE_PREVIEW_PROTOCOL=https`. Keep creator/admin routes on a different host; a
preview hostname is always interpreted as target application traffic and cannot reach admin APIs.

Configure OAuth apps with callback URLs using `AUTH_PUBLIC_API_URL` (the local frontend gateway uses
`http://localhost:3000/backend-api`):

```text
http://localhost:3000/backend-api/auth/oauth/github/callback
http://localhost:3000/backend-api/auth/oauth/google/callback
```

Email passwords are stored as scrypt hashes. OAuth account links and opaque session token hashes are
stored in the `oauth_accounts` and `creator_sessions` tables created by migration `003_creator_auth.sql`.
The browser receives only a secure, HttpOnly session cookie; provider access tokens are used server-side
for the callback and are never persisted or returned.

Create/configure authentication in this shape:

```json
{
  "name": "Demo",
  "targetUrl": "https://app.example.com/",
  "mode": "selected_routes",
  "routes": [
    { "path": "/dashboard", "title": "Dashboard", "description": "Main dashboard" },
    { "path": "/projects", "title": "Projects", "description": "Project management UI" }
  ],
  "authentication": {
    "provider": "password",
    "config": {
      "loginUrl": "https://app.example.com/login",
      "usernameSelector": "#email",
      "passwordSelector": "#password",
      "submitSelector": "button[type=submit]",
      "sessionToken": {
        "storage": "localStorage",
        "name": "access_token"
      },
      "verification": { "type": "expected_selector", "selector": "[data-user-menu]" }
    },
    "secret": { "username": "account@example.com", "password": "..." }
  }
}
```

`slug` is optional. If omitted, the backend generates a unique slug from the showcase name plus a random suffix.

For the common password flow, `username` and `password` may instead be supplied at the top level together with a required `login` object containing the same login URL, selectors, and verification strategy. The request values are immediately moved into the encrypted secret record; they are never written into the plaintext showcase configuration. Login selectors and verification cannot be guessed safely, so `login` is mandatory for this shorthand.

Verification also supports `expected_url`, `authenticated_endpoint`, and `absence_of_login_selector`. Secrets and captured session material are encrypted before persistence. Public responses never contain target URLs, provider details, credentials, tokens, cookies, or Playwright state.

`sessionToken` identifies either a cookie name or a direct token key in `localStorage` or `sessionStorage`. The creator
supplies only the storage type and name. Showrun captures the real value after login and keeps it
encrypted server-side. For browser storage, the sandbox receives a session-specific signed synthetic value; the target
application chooses its own request header and format, and Showrun substitutes only that placeholder
in the dependency-specific header names observed during the private scan, on approved upstream reads.
If the application changes how it sends the token, the creator must rescan before the bridge is updated.

After creating a showcase, `POST /api/showcases/:id/scan-dependencies` performs a creator-only,
authenticated browser scan of the explicitly configured pages. Static scripts, styles,
fonts, and images are saved in a hidden dependency manifest and approved automatically. Read-only
API requests are saved as unapproved candidates and can be blocked, approved with selected JSON fields
redacted, or approved in full with
`PATCH /api/showcases/:id/dependencies`. Visitor requests never add to or modify the manifest.
Cross-origin resources receive stable opaque preview aliases such as
`http://o-12ab34cd56ef--<slug>.localhost:4000`; the alias never reveals or selects an arbitrary upstream.

## Security properties

- Only stored target configuration selects an upstream. Visitor headers, query values, and request bodies cannot select a target.
- Only configured showcase routes and frozen, approved supporting dependencies are reachable. A configured `/projects` route permits `/projects` and nested paths such as `/projects/42`, but not `/projects-private`; `/` permits only the exact root. Traversal and multiply encoded traversal are rejected.
- Showcase traffic is read-only: only `GET` and `HEAD` reach the target. `POST`, `PUT`, `PATCH`, and `DELETE` return `405`; approved `OPTIONS` requests receive a local CORS preflight response and never reach the target.
- Every HTTP/HTTPS hop is resolved and checked immediately before a connection pinned to the validated address. All DNS answers must be public. Redirects are independently revalidated.
- Loopback, private, link-local, multicast, reserved, metadata, IPv4-mapped IPv6, and unsupported protocols are rejected.
- Incoming visitor cookies/authorization are removed. Session cookies and configured auth headers are attached only server-side. Browser-storage placeholders are substituted only in dependency-specific headers observed by the private scan. Proxy responses use a small functional header allowlist; authentication, cookies, infrastructure metadata, upstream CORS, caching, and framing policy never pass through.
- A response with an active redaction policy fails closed if it is no longer valid JSON or no longer matches every approved JSON pointer.
- Target HTML is rendered inside a sandboxed frontend iframe on a per-showcase origin. Relative URLs stay
  on that origin, known absolute origins map to isolated aliases, and an early capture-phase guard blocks pointer, keyboard, form,
  drag, and context-menu actions while preserving scrolling and hover rendering.
- Browser service workers and WebSockets are blocked; browser HTTP requests use the same validated, pinned transport as the proxy.
- Authentication failures do not automatically loop. An `ERROR` showcase requires creator action. Concurrent preparation shares a single promise per showcase.

## MVP limitations

- WebSocket applications are explicitly unsupported.
- The target must honor HTTP method semantics. A target `GET` or `HEAD` endpoint that causes a mutation cannot be made read-only by the proxy and must not be included in a showcase route or dependency scope.
- Rewriting covers HTML `href`, `src`, `action`, `poster`, `srcset`, inline/style-block CSS URLs, and CSS responses. JavaScript string rewriting, streaming responses, downloads larger than the configured response cap, signed absolute URLs, and complex CSP-dependent applications are not supported.
- Direct token values in `localStorage` and `sessionStorage` are supported through the explicit session bridge.
  Serialized objects, nested token fields, rotating browser-side refresh flows, and IndexedDB are not yet supported.
- Developers explicitly configure every navigable page. Supporting dependencies across validated origins are
  discovered only during a creator-triggered scan; static resources are approved automatically,
  while API/data requests require explicit approval. Public traffic can never expand access.
- Root-relative browser requests work naturally on the preview origin. Absolute URLs in HTML and CSS map
  to preview aliases on the server. URLs hidden in arbitrary JavaScript source strings, signed URLs,
  WebSockets, WebAuthn, origin-bound signatures, and service-worker-dependent apps remain unsupported;
  Showrun does not serialize private upstream-origin maps into the visitor's browser.
- The preparation coordinator deduplicates within one backend process. Run one backend replica for this MVP; add a PostgreSQL advisory-lock implementation before horizontal API scaling.
- Background session polling is intentionally absent. Expiry is detected lazily by TTL, 401, optional configured 403, login redirects, or a configured unauthenticated response marker.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

The tests cover creation, SSRF/IP/DNS/redirect blocking, lifecycle transitions, 50-way preparation deduplication, expiry, redaction, public response safety, fixed upstream selection, proxy header isolation, and authentication failure handling.
