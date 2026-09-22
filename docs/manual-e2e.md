# Manual end-to-end verification

Run this checklist with a staging copy of the private application before sharing a showcase. Use a
dedicated read-only account and non-production data.

## 1. Prepare the target

- Use an HTTPS application the Showrun backend can reach. Loopback, private-network, link-local,
  reserved, and cloud-metadata destinations are intentionally blocked.
- Create a dedicated account that cannot write, delete, deploy, invite users, change settings, or
  access unrelated secrets.
- List every top-level route reviewers should be able to open.
- If the app needs WebSockets, service workers, popup login, WebAuthn, file upload/download, or POST
  requests to load data, record that as a current compatibility limitation before testing.

## 2. Start Showrun

```bash
npm --prefix backend run db:migrate
npm run dev
```

Open `http://localhost:3000`, create or sign in to a creator account, and choose **Create showcase**.

## 3. Create and authenticate

1. Enter only the application's HTTPS URL. No username, password, selector, cookie name, or bearer
   token belongs in the creation form.
2. Choose the showcase mode and add the permitted sidebar routes.
3. Choose **Create and sign in**.
4. On the Connect page, confirm the login URL and open the controlled browser.
5. Enter the dedicated target-account credentials inside the controlled browser and complete login.
6. After the authenticated application is visibly loaded, choose **I’m logged in — save session**.
7. Confirm the project page reports an active controlled-browser session.

Pass criteria:

- Login works without CSS selectors or token configuration.
- The username and password do not appear in the showcase configuration or project page.
- The public status response contains no target URL, cookie, storage value, credential, or bearer
  token.
- Refreshing the project page reuses the encrypted captured state until its configured TTL expires.

## 4. Verify the public remote browser

1. Open the public showcase URL in a private/incognito window.
2. Confirm the content appears inside the Showrun browser viewport—not an iframe and not placeholder
   content.
3. Open every route from the Showrun sidebar.
4. Confirm browser hover, scrolling, safe controls, and text entry respond remotely.
5. Confirm the browser status bar says **WebRTC · live browser**, shows the current path and shows
   measured FPS while the application changes (static pages show **Idle · no screen changes**).
   Judge FPS during sustained scrolling/animation, not on an unchanged dashboard. The current
   frames while the application changes (static pages show **Idle · no screen changes**). Delivery
   targets up to 30 FPS but varies with Chrome, network and client decoding.
6. In developer tools, inspect the same-origin `/backend-api/remote-browser/:sessionId/webrtc`
   offer/answer request and the peer connection's data channel. Confirm JPEG frame packets and remote
   input use the data channel. The runtime token must not appear in the URL.
7. Confirm visitor network responses contain frames, not raw target HTML/JavaScript/API JSON or
   captured target cookies/storage. Remember that visible application content is still visible in
   the raster frames: the target account must not have access to unrelated secrets.
8. Throttle the network and scroll/type quickly. The final frame should catch up instead of replaying
   a long backlog, and typing/click order must remain correct. Check a ~300 ms RTT connection;
   frame delivery must not wait for each frame's round trip or for slow input operations to finish.
9. Choose **Reconnect** during login and confirm the current login fields/state remain intact. Block
   peer UDP and verify the **HTTP fallback** indicator, then restore connectivity and confirm WebRTC
   is retried automatically.

## 5. Verify boundaries and read-only behavior

- Attempt an unconfigured top-level navigation from inside the target app. It must be blocked.
- Try configured routes with traversal, encoded traversal, sibling prefixes, queries, and fragments.
  They must not select a new target or escape the configured route boundary.
- Trigger actions that normally use `POST`, `PUT`, `PATCH`, or `DELETE`. The controlled-browser bar
  must increase its blocked-request count and the target must remain unchanged.
- Confirm target-application WebSockets, downloads, uploads, dialogs, and popups do not succeed.
- Attempt negotiation with an untrusted/missing Origin or a wrong runtime capability. No private
  browser frame may be sent.
- Confirm in the target application's audit log and database that the walkthrough created no writes,
  jobs, invitations, uploads, deployments, or other side effects.
- Test any links or endpoints that mutate through `GET`. Exclude them from the showcase and remove
  permission at the target-account level; Showrun cannot infer that a nominally safe method mutates.

## 6. Verify isolation and expiry

- Open the same showcase in two private browser windows and confirm their navigation, scroll, and
  input state do not affect each other.
- Close one window and confirm the other continues working.
- A peer connection keeps the browser context active. Close/disconnect it and stop fallback
  polling for longer than `REMOTE_BROWSER_IDLE_TTL_SECONDS`; the old session must expire. Public
  viewers should recreate a context, while unfinished creator login should offer **Open browser**.
- Invalidate the target session, confirm the public showcase becomes unavailable, then use
  **Refresh session** on the project page and sign in again.
- Confirm one creator cannot open or capture another creator's login browser by changing project IDs.
- Restart the backend and confirm all live contexts are destroyed and viewer recovery is automatic.

## Release gate

Do not share the showcase until every configured route renders, the target account is independently
read-only, unsafe requests are blocked, no target mutation is observed, and no credential/session
material appears in visitor-visible storage or network responses.

For production, allow WebRTC peer UDP traffic, match backend `FRONTEND_URL` to the public frontend
origin, and use one backend replica or sticky routing across the entire lifecycle. Load-test the
expected number of simultaneous contexts and measure actual FPS, input latency, CPU and bandwidth.
