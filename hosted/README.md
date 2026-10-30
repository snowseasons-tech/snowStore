# Hosted Social Studio

Gives each subscriber their own private Social Studio, with the account limit from their plan. `sync.mjs` reads Stripe every few minutes and creates, changes and stops servers to match. Each subscriber's data and tokens stay in their own database.

## Set up the server (once)

You need a Linux server with Docker and Caddy, plus a wildcard DNS record pointing `*.social.example.com` at it. Each subscriber runs 3 containers, including MySQL, so plan for about 1 GB of memory per subscriber.

```bash
docker build -t social-studio:0.5.0 products/social-studio
cp hosted/ops.env.example hosted/ops.env   # fill it in
npm install
```

Add this to `/etc/caddy/Caddyfile`:

```
oauth.social.example.com {
	reverse_proxy 127.0.0.1:18000
}
import /path/to/snowStore/hosted/subscribers/*/Caddyfile
```

Run the OAuth relay as a service with `HOSTED_DOMAIN` set: `node hosted/oauth-relay.mjs`.

List these two addresses in your Meta and Google developer apps:

- `https://oauth.social.example.com/api/oauth/meta/callback`
- `https://oauth.social.example.com/api/oauth/google/callback`

Schedule the sync with cron, then check a dry run first:

```bash
node hosted/sync.mjs
```

```
*/5 * * * * cd /path/to/snowStore && flock -n /tmp/hosted-sync.lock node hosted/sync.mjs --apply >> hosted/subscribers/sync.log 2>&1
```

## What happens

| In Stripe | What the sync does |
|---|---|
| New active or trial subscription with `socialAccounts` in the catalog | Creates the server and emails a one-time setup link |
| Plan changes | Updates the account limit |
| Payment past due | Nothing; the server keeps running while Stripe retries |
| Canceled, unpaid or paused | Stops the server and keeps the data |
| Subscribed again | Starts the server |
| Stopped for over 30 days | Emails `OPS_EMAIL` to delete it. Deletion is always manual |
| Subscription missing from Stripe | Leaves the server running and emails `OPS_EMAIL` |

Lowering a limit doesn't disconnect anything. The subscriber can't add accounts until they're under the new limit.

## By hand

```bash
hosted/subscriber.sh stop <id>
hosted/subscriber.sh start <id>
hosted/subscriber.sh limit <id> 5
hosted/subscriber.sh delete <id> --yes
```

Back up `hosted/subscribers/`, the Docker volumes and `hosted/ops.env`. A subscriber's `.env` holds their `FERNET_KEY`, and their connected accounts can't be decrypted without it.
