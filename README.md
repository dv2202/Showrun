# Showrun

Showrun is a developer-focused platform for turning private web applications into safe, shareable showcases. A developer chooses the routes to present and configures authentication; visitors explore those routes through a read-only showcase shell without being able to trigger actions in the underlying application.

## Project structure

- `frontend/` — Next.js 16 and React 19 showcase/dashboard UI
- `backend/` — Fastify API, authentication bootstrap, route policy, secure proxy, and PostgreSQL persistence
- `backend/migrations/` — PostgreSQL schema migrations

The frontend uses the backend API for creator accounts, showcase configuration, authentication
preparation, and proxied target rendering. Proxied target pages are isolated in a sandboxed iframe;
the backend enforces route policy and read-only methods.

## Requirements

- Node.js 22 or newer
- npm
- PostgreSQL
- Chromium for password-based authentication (installed through Playwright)

## Installation

Install the root development launcher and each application's dependencies:

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

## Backend setup

Create the local environment file:

```bash
cp backend/.env.example backend/.env
```

Set `DATABASE_URL` and generate an encryption key with `openssl rand -base64 32`. Then install Chromium and migrate the database:

`frontend/.env`'s `BACKEND_URL` only tells Next.js where to proxy API requests. The backend loads
`DATABASE_URL` and `ENCRYPTION_KEY` from `backend/.env` when running development and migrations.

```bash
npm --prefix backend run playwright:install
npm --prefix backend run db:migrate
```

The default backend address is `http://127.0.0.1:4000`. Creator endpoints require the HttpOnly session cookie issued after email or OAuth login.

See [backend/README.md](backend/README.md) for the API, authentication payloads, security properties, and current limitations.
Use the [manual end-to-end checklist](docs/manual-e2e.md) with a staging target before sharing a
showcase publicly.

## Development

Start the backend (with nodemon) and frontend together from the repository root:

```bash
npm run dev
```

Open `http://localhost:3000`. The backend listens on `http://127.0.0.1:4000` by default.

## Verification

Run these checks before committing:

```bash
cd backend
npm run typecheck
npm test
npm run build

cd ../frontend
npm run typecheck
npm run build
npm run format:check
```

## Security model

- Only developer-configured routes may be exposed.
- Showcase traffic is limited to read-only `GET` and `HEAD` requests.
- Target selection and route authorization are enforced by the backend.
- Credentials and captured sessions are encrypted before persistence.
- Target requests are protected against SSRF and isolated from visitor-supplied authentication headers.

Never commit `.env` files, credentials, tokens, cookies, browser state, build output, or dependency directories. The root `.gitignore` excludes these generated and sensitive files across both applications.
