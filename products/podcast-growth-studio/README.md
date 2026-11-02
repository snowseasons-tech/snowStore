# Podcast Growth Studio

A deployable, single-client MVP for a mother–daughter podcast's promotional operations. FastAPI, SQLAlchemy, PostgreSQL, Alembic and a responsive browser dashboard. Designed for one trusted operations team behind a private HTTPS access gateway.

## Included

- Episode creation and editing; source URL and publication date.
- Clip draft editing, review, approval, future scheduling and manual publication confirmation. Editing review content resets approval; approved content must return to draft before editing. Cancel a schedule without losing the asset.
- Stage filters, counts, manually recorded performance snapshots and correction by removal.
- Optional OpenAI-compatible copy suggestions with an explicitly labeled template fallback. Human review is required.
- Login form, hashed opaque server-side sessions, 12-hour expiry and logout revocation. Password rotation invalidates existing session tokens. Login throttling, same-origin request checks, CSRF custom header, strict HttpOnly cookies, host validation and a restrictive Content Security Policy.
- Transactional audit events, optimistic concurrency protection for clips, bounded request bodies and paginated list APIs.
- Versioned database migrations, JSON workspace export, liveness/readiness probes and request IDs. Docker runs as a non-root user with a read-only filesystem.

Scheduling is a calendar record. This release does not upload/render video, connect social accounts, publish posts automatically or collect platform analytics. It has one shared operator login and no organizations, user roles or tenant isolation. Do not use it as a public multi-tenant SaaS.

## Start with Docker

```bash
python scripts/configure.py
# Creates .env with unique secrets and restrictive permissions; preserves existing files.
docker compose up --build -d
docker compose ps -a
```

Open http://localhost:8000 and sign in using `APP_USER` and `APP_PASSWORD`. Compose waits for PostgreSQL, runs `alembic upgrade head` as a one-shot service, then starts the web application. An exited migration service with code 0 is expected. Secrets remain in `.env`; restrict its permissions (`chmod 600 .env`) and never commit it.

For a private remote deployment, put an authenticated HTTPS gateway/reverse proxy in front of the localhost-bound port. Set `APP_ORIGIN=https://your-host`, add the host to `ALLOWED_HOSTS` (retain `localhost` for container health checks), and set `COOKIE_SECURE=true`. Preserve the external Host header. The app does not trust forwarded client IPs; configure a gateway login rate limit for remote use because the built-in per-IP limiter sees the proxy address. Use one application worker; multiple replicas require a shared rate-limit backend. Configure gateway request-size/time limits too.

Use a secret manager and injected environment variables for managed hosting. The gateway, DNS, certificate, backups and monitoring are deployment infrastructure, not provisioned by this repository. Configure monitoring for `/ready`, migration failures, database capacity and unsuccessful backups. `/health` is process liveness; `/ready` checks database connectivity. Business APIs require a session. Interactive API docs are disabled.

## Existing prototype database

Back up before migration. For the original README's `create_all` schema **only**, after confirming the three original tables and columns match `migrations/versions/0001_initial.py`, stamp that baseline once:

```bash
docker compose up -d db
docker compose run --rm migrate alembic stamp 0001
docker compose up --build -d
```

Fresh databases must run migrations without stamping. Never stamp an unknown schema. Upgrades preserve existing rows; the server refuses to start on the wrong revision. A database backup is the rollback path if a release fails. Do not use automatic destructive downgrades on live data.

## Backup and restore

```bash
mkdir -p backups
chmod 700 backups
# Custom-format dump, includes all app tables and migration revision:
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/podcast.dump
```

Encrypt and copy backups off-host on a regular schedule, monitor completion and rehearse restores. JSON export in the dashboard is useful for business data portability; it is not a database backup. Audit history and sessions are intentionally omitted from the export.

Restore to a **new, empty** database/stack, never over the current database:

```bash
# Stop the web service in the NEW stack before restoring.
docker compose stop web
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' < backups/podcast.dump
docker compose run --rm migrate
docker compose up -d web
```

For a backup from the original unversioned prototype, apply the baseline procedure above after restore. Changing `APP_PASSWORD` and restarting the web service revokes all prior sessions.

## Local development and validation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.lock
export APP_PASSWORD='a-unique-local-secret-at-least-16-characters'
export DATABASE_URL='sqlite:///./podcast.db'
alembic upgrade head
uvicorn app.main:app --reload
python -m pytest -q
```

SQLite is for local development. Tests create isolated databases, run actual migrations, exercise auth/CSRF/workflow/export/validation and verify legacy data survives upgrades. `requirements.lock` pins the tested dependency graph; regenerate it deliberately when updating dependencies and rerun tests plus the container build. Deployment uses Python 3.12. Logging includes request path, status and request ID; it excludes passwords and request bodies.

Optional AI configuration: `LLM_BASE_URL` (ending in `/v1`), `LLM_MODEL`, `LLM_API_KEY`. Point this only at an approved endpoint: episode title and description are sent to it. Invalid or unavailable model responses return template copy. Only use properly licensed assets and content approved by the podcast owners.

Optional browser regression check against a **disposable test workspace** (it creates episodes and clips):

```bash
npm ci
npx playwright install chromium
# Export APP_PASSWORD for the test instance, then:
npm run test:browser
# BASE_URL defaults to http://localhost:8000; CHROME_PATH selects an existing Chrome binary.
```

This exercises login, episode creation, draft editing, review, approval, scheduling, logout and mobile overflow. Screenshots are saved to `test-results/`. Do not run it against real client data.

The repository workflow `.github/workflows/podcast-growth-studio.yml` runs Python checks, a container build and the browser workflow against PostgreSQL on relevant pushes and pull requests. `ci.github.yml` is the portable copy for a standalone checkout.
