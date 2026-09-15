# Showrun backend

A TypeScript/Fastify backend that runs authenticated private applications inside controlled
Playwright Chromium contexts. Creators log in interactively through a streamed browser. Visitors
receive rendered frames rather than the target application's HTML, cookies, storage, or API tokens.

## Architecture

- `src/api`: creator authentication plus creator/public showcase endpoints
- `src/browser/remote-browser-runtime.ts`: isolated browser lifecycle, frames, input, navigation,
  browser-state capture, and read-only request enforcement
- `src/browser/playwright-bootstrapper.ts`: legacy automated login and compatibility utilities
- `src/security`: AES-256-GCM encryption, secret redaction, and URL/DNS/IP validation
- `src/proxy/secure-http-client.ts`: pinned-DNS HTTP transport used for every browser request
- `src/storage`: PostgreSQL production repository and in-memory test repository
- `migrations`: users, showcases, encrypted authentication/session state, and visits

The remote browser keeps one shared Chromium process and creates a separate browser context for
every creator login and visitor session. Runtime sessions are in memory, have random capability
tokens, expire after an idle timeout, and are destroyed on backend shutdown or showcase changes.

## Setup

Requirements: Node.js 22+ and PostgreSQL. Installing backend packages downloads the matching
Playwright Chromium build for macOS, Windows, or Linux.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run build
npm start
```

For production, build `backend/Dockerfile`. It installs Chromium and the required Linux libraries;
no host-specific Chrome path is needed.

```bash
docker build -t showrun-backend backend
```

Important runtime settings:

- `REMOTE_BROWSER_MAX_SESSIONS`: maximum simultaneous isolated contexts (default `20`)
- `REMOTE_BROWSER_IDLE_TTL_SECONDS`: session idle expiry (default `180`)
- `SESSION_TTL_SECONDS`: encrypted captured-login lifetime (default `3600`)
- `PROXY_TIMEOUT_MS` and `PROXY_MAX_RESPONSE_BYTES`: limits for each browser HTTP response
- `SHOWCASE_LEGACY_PATH_PROXY`: opt-in only; enables the retired iframe proxy when set to `true`

Store `ENCRYPTION_KEY` in a secret manager and terminate TLS at trusted ingress. Creator-entered
credentials travel through Showrun while typing into the remote browser, but are not stored as form
configuration. Captured cookies and browser storage are encrypted before persistence.

## Remote-browser API

Creator-only endpoints require the creator's HttpOnly Showrun session cookie:

- `POST /api/showcases/:id/auth-browser` — start an interactive login browser
- `POST /api/showcases/:id/auth-browser/:sessionId/capture` — encrypt the current browser state
- `POST /api/showcases`
- `GET /api/showcases` and `GET /api/showcases/:id`
- `PATCH /api/showcases/:id` and `DELETE /api/showcases/:id`

Public viewer lifecycle:

- `GET /api/showcases/:slug/status`
- `POST /api/showcases/:slug/remote-browser` — start an isolated viewer at a configured route
- `GET /api/remote-browser/:sessionId/frame` — receive the latest JPEG frame
- `POST /api/remote-browser/:sessionId/input` — constrained pointer, wheel, text, or key input
- `POST /api/remote-browser/:sessionId/navigate` — navigate to a configured sidebar route
- `DELETE /api/remote-browser/:sessionId` — destroy the context

Every runtime endpoint after creation requires the `x-showrun-runtime-token` capability returned at
session start. The token is redacted from logs and never placed in a URL.

## Security properties

- The stored target and route list—not visitor input—select top-level destinations.
- Every HTTP/HTTPS request is fetched through the pinned-DNS transport. Redirect hops are checked
  independently and private, loopback, link-local, metadata, reserved, and unsupported targets fail
  closed.
- Viewer contexts allow only `GET`, `HEAD`, and `OPTIONS`. Other methods are aborted and counted.
- Top-level navigation is restricted to the configured target origin and configured route prefixes.
- WebSockets, service workers, downloads, dialogs, and popup windows are blocked.
- Viewer contexts are isolated. The original encrypted state is copied into a context and never
  returned to the visitor.
- The visitor sees rasterized frames. Raw target HTML, JavaScript, API responses, cookies, local
  storage, session storage, target URLs, and bearer tokens are not returned by public status APIs.
- Creator ownership is checked before login-state capture. A runtime capability alone cannot save
  state to a showcase.

Use a dedicated least-privilege, read-only target account with non-production data. Network method
blocking is defense in depth: a target `GET` endpoint that causes mutations cannot be made safe by
Showrun.

## Current limitations

- Frame delivery uses short-polling JPEG screenshots rather than WebRTC. It is functional and easy
  to deploy, but higher-latency and less bandwidth-efficient than a production WebRTC transport.
- Browser runtime sessions live in one API process. Horizontal deployment needs sticky routing or a
  separate browser-runtime service and session directory.
- WebSockets and service-worker-dependent applications are unsupported.
- Downloads, file uploads, WebAuthn/passkeys, clipboard shortcuts, and popup-based login are blocked.
- Raster frames do not expose the target application's accessibility tree or native text selection.
- Session storage is captured explicitly; IndexedDB/OPFS-based authentication is not yet persisted.
- A dedicated application-level read-only account remains necessary when the target uses unsafe GET
  actions or requires POST-based read APIs such as some GraphQL deployments.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Tests cover creator ownership, encrypted capture, runtime capability checks, viewer creation, frame
delivery, input forwarding, route navigation, SSRF protection, lifecycle transitions, redaction, and
legacy proxy behavior while its opt-in flag is enabled.
