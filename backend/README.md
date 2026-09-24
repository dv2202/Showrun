# Showrun backend

A TypeScript/Fastify backend that runs authenticated private applications inside controlled
Playwright Chromium contexts. Creators log in interactively through a streamed browser. Visitors
receive rendered frames rather than the target application's HTML, cookies, storage, or API tokens.

## Architecture

- `src/api`: creator authentication plus creator/public showcase endpoints
- `src/browser/remote-browser-runtime.ts`: isolated browser lifecycle, frames, input, navigation,
  browser-state capture, and read-only request enforcement
- `src/api/remote-browser-stream.ts`: capability-authenticated WebRTC negotiation, bounded JPEG
  delivery, ordered input and peer teardown
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
- Peer connections use Google's public STUN service for ICE candidate discovery; allow outbound
  STUN and UDP traffic or expect the viewer to fall back to HTTP polling.

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
- `POST /api/remote-browser/:sessionId/webrtc` — exchange a complete SDP offer for an answer
- `GET /api/remote-browser/:sessionId/frame` — HTTP fallback JPEG frame
- `POST /api/remote-browser/:sessionId/input` — HTTP fallback constrained input
- `POST /api/remote-browser/:sessionId/navigate` — navigate to a configured sidebar route
- `DELETE /api/remote-browser/:sessionId` — destroy the context

HTTP runtime endpoints after creation require the `x-showrun-runtime-token` capability returned at
session start. WebRTC negotiation checks the request Origin against `FRONTEND_URL`; the capability
is sent in a header and never placed in a URL or logged.

## Live streaming and deployment

Playwright opens an internal CDP session and starts `Page.startScreencast` with JPEG quality 80 at
the configured viewport. Chrome emits frames when content changes; the runtime keeps the latest
trailing update and caps delivery at about 30 FPS. Frames exist only transiently in memory. The client
exchanges complete SDP offers and answers over same-origin HTTP, then carries JPEG frames over an
unordered, no-retry WebRTC data channel and validated input over a separate reliable, ordered channel.
Lost screenshots can be skipped so a fresh screen arrives promptly; one active decode and one latest
pending frame prevent stale render backlogs. This is not a video codec track: JPEG encoding and
bandwidth remain dependent on Chrome, the network and client decoding.

- Use HTTPS at ingress and preserve the browser's `Origin` header. WebRTC data channels are DTLS
  encrypted; negotiation rejects cross-site or missing Origins and verifies the runtime capability.
- Proxy `/backend-api/*` via Next.js to `BACKEND_URL`, or route that prefix directly to the backend
  while mapping it to `/api/*`. Allow outbound STUN and peer UDP traffic through the deployment
  network. Restricted or symmetric NATs may prevent a direct peer connection; HTTP polling remains
  available when that happens.
- Use one backend replica, or sticky routing across session creation, negotiation and all HTTP
  lifecycle endpoints. Browser contexts and peer connections live in one process.
- If WebRTC fails or emits no initial frame within seven seconds, the frontend uses HTTP polling and
  retries the peer connection after ten seconds. The toolbar identifies the active transport,
  measured FPS and current path. **Reconnect** retries the transport without clearing login state.
- FPS measures actual canvas renders, not a promised constant video rate. Static pages show
  **Idle · no screen changes**. HTTP fallback waits 250 ms after each screenshot/request/decode,
  so 2–3 FPS there is expected; check peer connectivity before tuning Chrome performance.
- Losing a browser context recreates public viewer sessions from saved state; creator login-in-progress
  instead returns to **Open browser**. Transport disconnect alone does not destroy the Chrome context.

## Security properties

- The stored target and route list—not visitor input—select top-level destinations.
- Every HTTP/HTTPS request is fetched through the pinned-DNS transport. Redirect hops are checked
  independently and private, loopback, link-local, metadata, reserved, and unsupported targets fail
  closed.
- Viewer contexts allow only `GET`, `HEAD`, and `OPTIONS`. Other methods are aborted and counted.
- Top-level navigation is restricted to the configured target origin and configured route prefixes.
- Target-application WebSockets, service workers, downloads, dialogs, and popup windows are blocked.
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

- Frame delivery uses JPEG data over WebRTC rather than a hardware-encoded video track, so it does
  not gain video-codec compression. Actual FPS and latency depend on Chrome, network and client decoding.
- Browser runtime sessions live in one API process. Horizontal deployment needs sticky routing or a
  separate browser-runtime service and session directory.
- Target WebSocket- and service-worker-dependent applications are unsupported.
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
