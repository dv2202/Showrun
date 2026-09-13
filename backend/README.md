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

Requirements: Node.js 22+, PostgreSQL, and a Chromium build for password authentication.

```bash
cp .env.example .env
npm install
npm run playwright:install
npm run db:migrate
npm run build
npm start
```

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

Public:

- `GET /api/showcases/:slug/status` (also `/showcase/:slug/status`)
- `GET|HEAD /showcase/:slug` and `/showcase/:slug/*`

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
    { "path": "/projects", "title": "Projects", "description": "Project management UI" },
    { "path": "/assets", "title": "Static assets", "description": "Required page assets" }
  ],
  "authentication": {
    "provider": "password",
    "config": {
      "loginUrl": "https://app.example.com/login",
      "usernameSelector": "#email",
      "passwordSelector": "#password",
      "submitSelector": "button[type=submit]",
      "verification": { "type": "expected_selector", "selector": "[data-user-menu]" }
    },
    "secret": { "username": "account@example.com", "password": "..." }
  }
}
```

`slug` is optional. If omitted, the backend generates a unique slug from the showcase name plus a random suffix.

For the common password flow, `username` and `password` may instead be supplied at the top level together with a required `login` object containing the same login URL, selectors, and verification strategy. The request values are immediately moved into the encrypted secret record; they are never written into the plaintext showcase configuration. Login selectors and verification cannot be guessed safely, so `login` is mandatory for this shorthand.

Verification also supports `expected_url`, `authenticated_endpoint`, and `absence_of_login_selector`. Secrets and captured session material are encrypted before persistence. Public responses never contain target URLs, provider details, credentials, tokens, cookies, or Playwright state.

## Security properties

- Only stored target configuration selects an upstream. Visitor headers, query values, and request bodies cannot select a target.
- Only configured showcase routes are reachable. A configured `/projects` route permits `/projects` and nested paths such as `/projects/42`, but not `/projects-private`; `/` permits only the exact root. Traversal and multiply encoded traversal are rejected.
- Showcase traffic is read-only: only `GET` and `HEAD` are accepted. `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS` return `405` without reaching the target.
- Every HTTP/HTTPS hop is resolved and checked immediately before a connection pinned to the validated address. All DNS answers must be public. Redirects are independently revalidated.
- Loopback, private, link-local, multicast, reserved, metadata, IPv4-mapped IPv6, and unsupported protocols are rejected.
- Incoming visitor cookies/authorization are removed. Session cookies and configured auth headers are attached only server-side. `Set-Cookie`, auth, hop-by-hop, and conflicting framing headers are removed from proxy responses.
- Target HTML is rendered inside a sandboxed frontend iframe. Same-origin URLs are rewritten through
  `SHOWCASE_PUBLIC_PROXY_PREFIX`, and an early capture-phase guard blocks pointer, keyboard, form,
  drag, and context-menu actions while preserving scrolling and hover rendering.
- Browser service workers and WebSockets are blocked; browser HTTP requests use the same validated, pinned transport as the proxy.
- Authentication failures do not automatically loop. An `ERROR` showcase requires creator action. Concurrent preparation shares a single promise per showcase.

## MVP limitations

- WebSocket applications are explicitly unsupported.
- Rewriting covers HTML `href`, `src`, `action`, `poster`, `srcset`, inline/style-block CSS URLs, and CSS responses. JavaScript string rewriting, streaming responses, downloads larger than the configured response cap, signed absolute URLs, and complex CSP-dependent applications are not supported.
- Password-authenticated targets must use cookies for subsequent HTTP authentication. Target credentials kept only in local storage cannot be safely attached by the server-side proxy and are unsupported.
- Developers must explicitly configure every required page, asset, and read-only API route. The backend never crawls or discovers dependencies.
- JavaScript-generated absolute URLs are not rewritten. Applications that construct root-relative
  asset or API URLs at runtime may need target-specific changes before they render correctly.
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
