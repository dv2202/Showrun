# Showrun

Showrun is a developer-focused platform for turning private web applications into safe, shareable showcases. A developer chooses the routes to present and configures authentication; visitors explore those routes through a read-only showcase shell without being able to trigger actions in the underlying application.

## Project structure

- `frontend/` — Next.js 15 and React 19 showcase/dashboard UI
- `backend/` — Fastify API, authentication bootstrap, route policy, secure proxy, and PostgreSQL persistence
- `backend/migrations/` — PostgreSQL schema migrations

The frontend currently uses in-memory mock showcase data in `frontend/services/showcases.ts`. Backend integration is the next connection point.

## Requirements

- Node.js 22 or newer
- npm
- PostgreSQL
- Chromium for password-based authentication (installed through Playwright)

## Installation

Install each application's dependencies:

```bash
cd backend
npm install

cd ../frontend
npm install
```

## Backend setup

Create the local environment file:

```bash
cd backend
cp .env.example .env
```

Set `DATABASE_URL`, generate an encryption key with `openssl rand -base64 32`, and set a random `ADMIN_API_TOKEN` of at least 24 characters. Then install Chromium, migrate the database, and start the API:

```bash
npm run playwright:install
npm run db:migrate
npm run dev
```

The default backend address is `http://127.0.0.1:3000`. Creator endpoints require `Authorization: Bearer <ADMIN_API_TOKEN>`.

See [backend/README.md](backend/README.md) for the API, authentication payloads, security properties, and current limitations.

## Frontend setup

Start the Next.js development server from a second terminal. Port `3001` avoids conflicting with the backend's default port:

```bash
cd frontend
npm run dev -- --port 3001
```

Open `http://localhost:3001`.

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
