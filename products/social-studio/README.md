# Social Studio

A self-hosted social media content manager for agencies and small teams. Keep a separate workspace per client, draft posts (by hand or with an AI writer), send them through approval, schedule them, and let a background worker publish them to Facebook Pages, Instagram professional accounts and Google Business Profile.

Runs on your own server with Docker: a FastAPI web app, a publishing worker and MySQL. No subscription, and your clients' account tokens stay in your database, encrypted.

## What you get

- **Client workspaces**: each client has its own posts, connected accounts and team. People only see the workspaces they're added to.
- **Team roles**: owner (everything, including connecting accounts and adding people), editor (drafts), approver (approves and schedules), viewer (read-only).
- **Approval workflow**: draft → submitted → approved → scheduled → published, with reject and edit loops. Nothing publishes without an approver.
- **AI Studio (optional)**: writes separate Google, Facebook and Instagram versions of a topic in the client's tone, using any OpenAI-compatible endpoint (for example a local llama.cpp server). Without one, it fills in simple templates.
- **Publishing worker**: posts at the scheduled time, waits for Instagram media processing, refreshes Google tokens, and never auto-retries a failed post, so a provider hiccup can't create a duplicate public post.
- **Content calendar and dashboard** with per-status counts.

## Before you buy: what publishing needs

Drafting, approvals and scheduling work as soon as the app is running. **Automatic publishing needs developer access that you set up with Meta and Google yourself**:

- **Facebook and Instagram:** a Meta developer app using Facebook Login, with the `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic` and `instagram_content_publish` permissions. Publishing for client Pages you don't own requires Meta **App Review** and usually **Business Verification**, which can take days to weeks. Instagram accounts must be professional (business or creator) accounts linked to a Facebook Page.
- **Google Business Profile:** a Google Cloud project with the Business Profile APIs enabled. Google grants access to these APIs on request, so apply early.
- **A public HTTPS address** for the app, because Meta and Google send users back to it after they authorize (`PUBLIC_URL`).

Until that's in place, you can use Social Studio as a planning and approval tool and copy approved posts out with the **Copy** button.

## Quick start

Requirements: Docker with Compose v2, and Python 3 (only to generate two keys).

1. Create your settings file and two secret keys:

   ```bash
   cp .env.example .env
   python3 -m pip install cryptography
   python3 -c "import secrets; from cryptography.fernet import Fernet; print('SECRET_KEY=' + secrets.token_hex(32)); print('FERNET_KEY=' + Fernet.generate_key().decode())"
   ```

2. Edit `.env`:
   - Paste in the `SECRET_KEY` and `FERNET_KEY` lines you just generated. **Back up `FERNET_KEY`**: connected account tokens can't be decrypted without it.
   - Set `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD` to long passwords made of letters and numbers.
   - Set `PUBLIC_URL` to the address people will use, for example `https://social.example.com`.
   - Optionally set `APP_NAME` to your agency's name; it appears in the sidebar and browser tab.

3. Start it:

   ```bash
   docker compose up --build -d
   docker compose logs -f web worker
   ```

4. Open `http://localhost:8000` (or your `PUBLIC_URL`) and click **Create account**. The first account to sign up becomes the first user. After that, sign-ups are closed (see below).

The web app listens on `127.0.0.1:8000` only. To serve it on the internet, put a reverse proxy with HTTPS in front of it (Caddy, nginx, Traefik or similar) and point it at port 8000.

## Accounts and invites

- With `ALLOW_REGISTRATION=0` (the default), only the very first account can sign up on its own. That stops strangers from creating accounts on a public server.
- To add someone, open a client workspace, go to **Team access**, and enter their email and role. If they already have an account they're added straight away. If not, you get a **one-time invite code**: send it to them, and they enter it together with that email when they click **Create account**. Codes expire after 7 days. Adding the same email again replaces the old code.
- Set `ALLOW_REGISTRATION=1` only if you want anyone who can reach the server to be able to sign up.

## Forgotten passwords

- **By email:** fill in the `SMTP_*` settings in `.env` with any mail provider (your email host, Postmark, Mailgun, Amazon SES and so on), then restart. **Forgot password?** on the sign-in screen then emails a one-time link that works for 30 minutes. The reply is the same whether or not the email has an account, so the form can't be used to find out who's registered. Repeat requests within 2 minutes don't send another email.
- **From the server:** when email isn't set up, or the owner is locked out, run:

  ```bash
  docker compose exec web python -m app.reset_password you@example.com
  ```

  It asks for the new password twice. Add `--generate` to have it create and print a random one instead.

Either way, changing a password signs that person out on every other device and cancels any unused reset links.

## Daily workflow

1. **New client**: name, service area, website and tone. The AI writer uses all four.
2. **AI Studio**: enter a topic, pick platforms, generate, then edit and **Save as draft**. Instagram posts need a public `https://` image URL.
3. **Submit for approval**; an approver or owner **Approves** or **Rejects** it. Editing a rejected or failed post sends it back to draft.
4. **Schedule**: pick a connected account and a date and time.
5. The worker checks every 15 seconds and publishes posts that are due. Published posts show the platform's post ID; failed posts show the error.

If the worker is stopped in the middle of publishing, the post is marked **failed** after 10 minutes with a note to check the platform before resubmitting, because it may already have gone out.

## Connecting accounts

### Facebook and Instagram

1. In the Meta developer dashboard, create an app with **Facebook Login** and request the permissions listed above.
2. Add `PUBLIC_URL/api/oauth/meta/callback` as a valid OAuth redirect URI.
3. Set `META_APP_ID` and `META_APP_SECRET` in `.env` and restart (`docker compose up -d`).
4. In Social Studio, a workspace owner opens **Social accounts → Connect Facebook + Instagram**. Every Page the person manages, and any Instagram professional account linked to it, is added to that workspace.

Facebook posts are text, with the image URL (if any) attached as a link.

### Google Business Profile

1. In Google Cloud, enable the My Business Account Management, Business Information and Google My Business APIs, and set up an OAuth consent screen and a web OAuth client.
2. Add `PUBLIC_URL/api/oauth/google/callback` as an authorized redirect URI.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` and restart.
4. A workspace owner clicks **Connect Google Business Profile**. Each location the account can manage is added.

## AI writer (optional)

Point `LLM_BASE_URL` at any OpenAI-compatible `/v1` endpoint and set `LLM_MODEL` to its model name (`LLM_API_KEY` too, if it needs one). For a local llama.cpp server on the same machine, the default `http://host.docker.internal:8080/v1` works from inside Docker. If no model is set, or the model doesn't answer with usable JSON, AI Studio falls back to templates and says so (`Mode: template`). The writer is told not to invent offers, testimonials, credentials or contact details, and every post still goes through approval.

## Settings reference

| Setting | Purpose |
| --- | --- |
| `APP_NAME` | Name shown in the sidebar and browser tab (default `Social Studio`) |
| `ALLOW_REGISTRATION` | `0` = first account plus invites only (default), `1` = open sign-up |
| `MAX_ACCOUNTS` | Connected social accounts allowed across the server, for example `3`. `0` = no limit (default) |
| `SETUP_CODE` | Hosted servers: the first account must use this code, sent in the welcome link |
| `SUBSCRIBER_ID`, `OAUTH_REDIRECT_URL` | Hosted servers: send OAuth through one shared address. See `hosted/README.md` |
| `SECRET_KEY` | Signs login sessions. Changing it signs everyone out |
| `FERNET_KEY` | Encrypts connected account tokens. Keep it safe and backed up |
| `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Database passwords used by Docker Compose |
| `PUBLIC_URL` | Public address, used for OAuth redirect URLs |
| `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` | Meta app for Facebook and Instagram |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client for Business Profile |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Optional OpenAI-compatible AI writer |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` | Optional email for password reset links. `SMTP_SECURITY` is `starttls` (default), `ssl` or `none` |

## Backups and updates

- Back up the `mysqldata` Docker volume and your `.env` file. Without the same `FERNET_KEY`, restored account connections stop working and have to be reconnected.
- The database tables are created automatically on first start. There's no migration tool yet, so before updating to a newer version, back up the database.

## Running the tests

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock -r requirements-dev.txt
.venv/bin/python -m pytest
```

The tests use a temporary SQLite database and simulated Meta, Google and AI responses, so they need no accounts, Docker or internet access. They cover sign-up and invites, password resets (including a real SMTP delivery to a local test server), workspace isolation, roles, the approval and scheduling rules, the OAuth flow, the worker, and the provider calls.

## Known limitations

- The login session is a 12-hour token kept in the browser's local storage. There's no two-factor login or login rate limiting yet, so use long passwords and keep the server behind HTTPS.
- Real publishing hasn't been tested against live Meta or Google accounts by us. It depends on your app approvals, account eligibility and the providers' APIs, which change over time.
- Images are referenced by public URL; there's no built-in image upload or media library.
- With `MAX_ACCOUNTS` set, a Meta or Google sign-in adds accounts in the order the provider lists them until the limit is full, and there's no way yet to pick which ones. Reconnecting an existing account never counts against the limit.
- Facebook Page tokens follow Meta's expiry rules. If publishing starts failing with a token error, reconnect the account.

## API

Interactive API docs are at `/docs` on your server. Main routes:

- `GET /api/config`, `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/me`, `GET /api/plan`
- `POST /api/auth/forgot` (emails a reset link), `POST /api/auth/reset`
- `GET/POST /api/clients`, `POST /api/clients/{id}/members`
- `POST /api/clients/{id}/generate`
- `GET/POST /api/clients/{id}/posts`, `PUT /api/clients/{id}/posts/{post_id}`
- `POST /api/clients/{id}/posts/{post_id}/submit|approve|reject|schedule`
- `GET /api/clients/{id}/connections`, `DELETE /api/clients/{id}/connections/{connection_id}`
- `POST /api/oauth/google|meta/start` (returns the provider URL) and `GET /api/oauth/google|meta/callback`
