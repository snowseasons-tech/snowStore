# MailHub

Self-serve email marketing. Keep contact lists, tag people into segments, write a campaign, test it, send it, and see opens, clicks, unsubscribes and bounces per campaign. Email goes out through [Resend](https://resend.com) from your own verified domain.

Runs with Docker: a FastAPI web app, a sending worker and MySQL. One server belongs to one business.

## What you get

- **Sign-in**: the first account claims the server. Hosted servers need the setup link from the welcome email.
- **Lists and CSV import**: columns `email`, `first_name`, `last_name`, `tags` (separated by `;` or `|`). You must confirm the people agreed to hear from you.
- **Segments**: everyone with any, or all, of the chosen tags. A campaign targets a list, a segment, or a segment within a list.
- **Campaigns**: draft, test, send, then pause, resume or cancel. Use `{{first_name|there}}`, `{{last_name}}` and `{{email}}` in the subject and body.
- **Stats per campaign**: sent, unique and total opens and clicks, clicks per link, unsubscribes, bounces and complaints.

## Anti-spam, built in

- Every email, tests included, gets an unsubscribe link and your postal address. You can't send without an address on file.
- Every email carries `List-Unsubscribe` one-click headers, which Gmail and Yahoo require of bulk senders.
- Opening the unsubscribe link only asks. The change happens on the button or the mail app's one-click POST, so link scanners can't unsubscribe people.
- Unsubscribes, hard bounces and spam complaints go on a suppression list that outlives the contact. Re-importing an address doesn't bring it back, and nothing in the app removes it.
- Suppression is checked when a campaign is queued and again right before sending.
- A campaign pauses itself after 100 sends if bounces pass 5% or complaints pass 0.3%. Resuming overrides this for that campaign.

You're still responsible for the law where you and your readers are: CAN-SPAM, CASL, GDPR and others. Some of them require more than this software does, such as proof of consent.

## What sending costs

Each customer brings their own Resend account by default, so sending is billed to them, and one customer's reputation can't hurt another's. Check Resend's current pricing.

`MAX_MONTHLY_SENDS` caps emails per server per calendar month (UTC), including tests. A campaign bigger than what's left is refused. If the limit runs out mid-send, the campaign pauses. Sends that fail are handed back. `SEND_RATE_PER_SECOND` sets the pace and should stay at or under your Resend account's rate limit.

## Quick start

Requirements: Docker with Compose v2, and Python 3 (only to generate two keys).

```bash
cp .env.example .env
python3 -m pip install cryptography
python3 -c "import secrets; from cryptography.fernet import Fernet; print('SECRET_KEY=' + secrets.token_hex(32)); print('FERNET_KEY=' + Fernet.generate_key().decode())"
```

Paste those lines into `.env`, set both MySQL passwords and match the password inside `DATABASE_URL`. **Back up `FERNET_KEY`**: stored Resend keys can't be decrypted without it. Then:

```bash
docker compose up --build -d
```

Open `http://localhost:8010` and create your account. Set `PORT` to use another port.

Before real sending, put it behind HTTPS and set `PUBLIC_URL` to that address. Unsubscribe and tracking links use it, so changing it later breaks links in email already sent.

## Set up sending

In **Settings**:

1. Paste a full-access Resend API key. A sending-only key can't add domains.
2. Add your domain, then copy the DNS records it shows to your DNS host. A subdomain such as `mail.yourbusiness.com` keeps marketing separate from your everyday mail.
3. Choose **Check DNS** until it shows verified.
4. Fill in your From name, a From address on that domain, and your postal address.
5. In Resend, add a webhook for the URL shown, with `email.bounced` and `email.complained`, and paste its signing secret. Without this, bounces and complaints aren't suppressed.

Keep Resend's own open and click tracking off for this domain, since MailHub does its own.

## About the stats

Opens use a hidden image. Mail apps that block images undercount them, and Apple Mail Privacy Protection and security scanners overcount them. Scanners can also inflate clicks. Treat both as trends. Links in the plain-text part and links with merge tags aren't tracked. MailHub stores no IP addresses or user agents.

## Settings

| Setting | Purpose |
|---|---|
| `MAX_MONTHLY_SENDS` | Emails per calendar month. 0 means no limit |
| `SEND_RATE_PER_SECOND` | Sending pace |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Optional. Use these instead of the Settings page |
| `RESEND_BASE_URL` | Points at a fake Resend for local testing |
| `SETUP_CODE` | Hosted servers: required to create the first account |
| `ALLOW_REGISTRATION` | 1 lets anyone who can reach the server sign up |
| `SMTP_*` | Password reset email. Otherwise: `docker compose exec web python -m app.reset_password you@example.com` |

## Tests

```bash
pip install -r requirements.lock -r requirements-dev.txt
python -m pytest
```

The tests use SQLite and a stand-in for Resend, and send nothing.

## Known limits

No scheduling, templates or visual editor, signup forms, double opt-in, automations, team roles, or migrations (tables are created at startup; adopt Alembic before changing them on live servers). Login has no rate limit.
