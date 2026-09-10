# AGENTS.md

## Project

Build a developer-focused application showcase platform.

The platform allows a developer to provide a private web application's URL and authentication credentials, configure which routes should be showcased, and generate a public shareable showcase URL.

The interviewer/visitor can visually explore the developer's application through a dedicated Showcase UI, but cannot interact with the underlying application or trigger real application actions.

The core product is NOT a generic reverse proxy.

The reverse proxy is infrastructure used to securely retrieve/render the target application.

---

## Core Product Idea

A developer has an application such as:

https://private-app.example

They configure:

* Target URL
* Username
* Password
* Showcase mode
* Allowed routes
* Route titles
* Route descriptions

The platform generates:

https://showcase.example/demo/my-project

The visitor sees:

```text
┌──────────────────────────────────────────────┐
│ Showcase                                     │
├──────────────┬───────────────────────────────┤
│ Dashboard    │                               │
│ Projects     │      Target application       │
│ Analytics    │      rendered here            │
│ Settings     │                               │
│              │                               │
│              │                               │
└──────────────┴───────────────────────────────┘
```

The visitor can navigate using the Showcase sidebar.

Clicks inside the target application are blocked.

---

## Product Principles

### 1. Developer controls what is exposed

Do NOT automatically discover application routes.

Do NOT build an AI route-discovery system.

The developer explicitly configures the routes.

Example:

```json
[
  {
    "path": "/dashboard",
    "title": "Dashboard",
    "description": "Main dashboard showing project metrics."
  },
  {
    "path": "/projects",
    "title": "Projects",
    "description": "Project management interface."
  },
  {
    "path": "/analytics",
    "title": "Analytics",
    "description": "Analytics and visualization interface."
  }
]
```

### 2. Navigation belongs to Showcase

The target application's navigation must not be relied upon.

The Showcase shell owns navigation.

Only routes configured by the developer may be navigated to.

### 3. Target application is read-only

The target application is displayed for visual exploration.

The visitor must not be able to:

* click buttons
* submit forms
* execute actions
* delete data
* create data
* modify data
* run benchmarks
* trigger jobs
* upload files
* download files
* deploy
* execute commands
* trigger workflows

### 4. Do not over-engineer click classification

Do NOT attempt to determine whether individual target-app clicks are safe or dangerous.

For MVP:

```text
Target application pointer interaction = blocked
```

The visitor can still:

* scroll
* hover
* select text
* view animations
* visually inspect the UI

Showcase sidebar interactions remain fully functional.

### 5. Security is enforced server-side

Never rely solely on frontend restrictions.

The backend must enforce:

* allowed showcase routes
* target URL
* authentication
* SSRF protection
* session isolation
* credential encryption
* target-origin isolation

A malicious visitor must not be able to bypass the frontend and directly proxy arbitrary target URLs.

---

## Showcase Modes

### Selected Routes

Developer explicitly selects routes.

Example:

```text
/dashboard
/projects
/projects/42
/analytics
```

Only these routes are accessible.

### Full Application

Expose all configured showcase routes.

"Full Application" does NOT mean unrestricted proxy access.

It still respects:

* server-side route policy
* read-only behavior
* SSRF protection
* authentication boundaries
* disabled application interaction

---

## Authentication

Credentials supplied by the developer must never be stored in plaintext.

Use authenticated encryption such as AES-256-GCM.

Authentication can use an isolated Playwright/Chromium process.

Flow:

```text
No valid session
      ↓
PREPARING
      ↓
Launch isolated browser
      ↓
Open configured login URL
      ↓
Fill username/password
      ↓
Submit login
      ↓
Verify authentication
      ↓
Capture authenticated session
      ↓
Encrypt session state
      ↓
Persist session
      ↓
ACTIVE
```

Playwright is used for authentication/session acquisition.

It should not remain running for every visitor request.

---

## Reverse Proxy

Visitor:

```text
/showcase/my-demo/projects/42
```

Target:

```text
https://private-app.example/projects/42
```

The target URL comes from server-side showcase configuration.

Never allow:

* query parameters
* Host headers
* Origin headers
* Referer headers
* forwarded headers
* visitor-controlled URLs

to select a different upstream.

---

## SSRF Protection

Before connecting to a target:

1. Require HTTP or HTTPS.
2. Resolve hostname.
3. Validate resolved IP.
4. Reject private IP ranges.
5. Reject loopback.
6. Reject link-local.
7. Reject metadata addresses.
8. Reject multicast.
9. Reject reserved/special-use ranges.
10. Pin the connection to the validated IP.
11. Repeat validation for every redirect.

Never trust hostname validation alone.

---

## Response Handling

Target responses may need to be rewritten so the visitor remains inside the Showcase URL namespace.

Rewrite supported URL-bearing content such as:

* HTML links
* scripts
* images
* forms
* stylesheets
* `srcset`
* CSS URLs

Example:

```text
https://private-app.example/projects/42
```

becomes:

```text
/showcase/my-demo/projects/42
```

Do not attempt arbitrary JavaScript source rewriting in MVP.

Hard-coded URLs inside JavaScript may remain unsupported.

WebSockets are unsupported in MVP.

---

## Cookies and Authentication Headers

Target authentication cookies must remain server-side.

Never expose target authentication cookies to visitors.

Remove target `Set-Cookie` headers from responses.

Remove inappropriate authentication/hop-by-hop headers before returning the response.

Attach stored authentication state server-side when making target requests.

---

## Session Expiration

If target responds with:

* 401
* configured 403
* login redirect
* configured unauthenticated marker

invalidate the stored session.

Transition showcase to:

```text
AUTHENTICATION_EXPIRED
```

A new authentication preparation can then acquire a fresh session.

Concurrent visitors must share the same preparation operation.

Do not launch one browser per visitor.

---

## Frontend Architecture

The frontend contains two major areas:

```text
Showcase Shell
    ├── Header
    ├── Sidebar
    ├── Route navigation
    ├── Route metadata
    └── Target Application Viewer
```

The target application is visually embedded/rendered inside the viewer.

The target viewer must have application pointer interaction disabled.

The Showcase shell remains interactive.

---

## Important UX

The visitor should immediately understand:

> This is an interactive visual showcase, not the live application.

Show a subtle indicator:

```text
🔒 Showcase Mode · Read Only
```

If appropriate, provide a tooltip/message explaining that application actions are intentionally disabled.

Do not make the UI look broken.

---

## What NOT to Build

Do not build:

* AI route discovery
* automatic application crawling
* automatic route classification
* automatic action-risk classification
* arbitrary target URL proxying
* unrestricted iframe proxying
* WebSocket support
* JavaScript URL rewriting
* production-grade browser virtualization
* full remote desktop/browser streaming

These are outside MVP scope.

---

## Engineering Philosophy

Prefer:

* simple architecture
* explicit configuration
* server-side security
* deterministic behavior
* clear boundaries
* strong typing
* testable components
* minimal dependencies

Do not introduce complexity merely to make the system appear sophisticated.

The MVP should clearly demonstrate:

1. Secure authenticated application access.
2. Configurable route exposure.
3. Showcase-owned navigation.
4. Read-only visual application rendering.
5. Strong SSRF protection.
6. Secure session handling.
7. Clean developer/interviewer UX.
