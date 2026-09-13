# Manual end-to-end verification

Run this checklist with a staging copy of the private application before sharing a showcase. Use a
dedicated, least-privilege test account and non-production data.

## 1. Prepare the target

- Use an HTTPS target that the Showrun backend can reach over the public internet. Loopback,
  private-network, link-local, and metadata addresses are intentionally blocked by SSRF protection.
- Confirm that login produces cookies. Targets that keep authentication only in local storage are
  not supported by the server-side proxy.
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

1. Enter the staging application URL, dedicated account credentials, login URL, and selectors.
2. Choose the showcase mode and explicitly enter the permitted routes.
3. Create the showcase and open its public path.
4. Wait for authentication preparation to finish.

Pass criteria:

- The iframe shows content from the configured target application, not placeholder content.
- The username, password, target cookies, and captured browser state never appear in the page,
  public status response, browser storage, or browser network response bodies.
- Refreshing the page reuses the encrypted server-side session while it remains valid.

## 4. Verify route boundaries

- Open every configured route from the Showrun sidebar and confirm the expected target page loads.
- Directly request an unconfigured path under `/backend-showcase/<slug>/...`; it must return `404`.
- Test paths that share a prefix, traversal strings, and encoded traversal. They must not reach the
  target unless the normalized path is explicitly allowed.
- Check the browser console and network panel for blocked asset or API requests. Add only the
  minimum read-only dependency paths required by the presentation.

## 5. Verify read-only behavior

- Scroll and hover inside the target frame.
- Try links, buttons, form controls, context menus, drag actions, Enter, and Space. They must not
  activate target actions or navigate the frame.
- Send `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS` requests to an allowed proxy path. Each must
  return `405` without reaching the target.
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
