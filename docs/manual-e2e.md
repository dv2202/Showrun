# Manual end-to-end verification

Run this checklist with a staging copy of the private application before sharing a showcase. Use a
dedicated, least-privilege test account and non-production data.

## 1. Prepare the target

- Use an HTTPS target that the Showrun backend can reach over the public internet. Loopback,
  private-network, link-local, and metadata addresses are intentionally blocked by SSRF protection.
- Determine whether login uses cookies or a direct token value in localStorage. For localStorage,
  record the key name, outgoing header name, and header prefix; never copy the token value itself.
- Disable CAPTCHA or interactive MFA for the dedicated staging account.
- Record the login URL and stable CSS selectors for the username field, password field, submit
  control, and an element visible only after successful login.
- List every route the page needs, including assets and read-only API paths. Showrun does not crawl
  or infer dependencies.

## 2. Start Showrun

From the repository root:

```bash
npm --prefix backend run db:migrate
npm run dev
```

Open `http://localhost:3000`, create or sign in to a creator account, and choose **Create showcase**.

## 3. Create and prepare a showcase

1. Enter the staging application URL, dedicated account credentials, login URL, and selectors. If
   needed, enable the localStorage bridge and enter its non-secret key/header mapping.
2. Choose the showcase mode and explicitly enter the permitted routes.
3. Create the showcase, open its project page, and choose **Scan & publish**.
4. Review any detected API/data dependencies and approve only the reads needed by the showcase.
5. Open the public path and wait for authentication preparation to finish.

Pass criteria:

- The iframe shows content from the configured target application, not placeholder content.
- The username, password, target cookies, real localStorage token, and captured browser state never
  appear in the page, public status response, browser storage, or browser network response bodies.
  A synthetic placeholder may appear when the localStorage bridge is enabled.
- Refreshing the page reuses the encrypted server-side session while it remains valid.

## 4. Verify route boundaries

- Open every configured route from the Showrun sidebar and confirm the expected target page loads.
- Directly request an unconfigured path under `/backend-showcase/<slug>/...`; it must return `404`.
- Test paths that share a prefix, traversal strings, and encoded traversal. They must not reach the
  target unless the normalized path is explicitly allowed.
- Confirm scripts, styles, fonts, and images detected by the private scan load without appearing in
  Showcase navigation.
- Confirm detected API/data requests stay blocked until the creator explicitly approves them.
- Change a captured dependency query string and confirm the request returns `404` without reaching
  the target.

## 5. Verify read-only behavior

- Scroll and hover inside the target frame.
- Try links, buttons, form controls, context menus, drag actions, Enter, and Space. They must not
  activate target actions or navigate the frame.
- Send `POST`, `PUT`, `PATCH`, and `DELETE` requests to an allowed proxy path. Each must return `405`
  without reaching the target. An `OPTIONS` preflight may return `204`, but must also never reach it.
- Confirm in the target application's audit log or database that the walkthrough created no writes,
  jobs, uploads, downloads, deployments, or other side effects.

## 6. Verify failure and expiry handling

- Temporarily invalidate the staging credentials or session and confirm the public viewer shows a
  generic unavailable state without internal details.
- Sign in as the creator, re-authenticate the project, and confirm it returns to the active state.
- Confirm one creator cannot read, edit, prepare, or delete another creator's showcase by changing
  the project ID.

## Release gate

Do not share a target publicly until every configured navigation route renders correctly, required
dependencies are minimal, all interaction tests are blocked, no target mutation is observed, and no
credential or session material is visible to the browser.
