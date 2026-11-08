# Post-purchase welcome series (stage 6)

Status: **built, not yet sending.** Emails go out only after a scheduler calls the runner (setup below).

## The series

| Email | When | Content | Where it comes from |
|---|---|---|---|
| 1 | Immediately after purchase | Thank you, order page with download links | Existing purchase email in `api/_lib/fulfil.js`. Not changed. |
| 2 | +24 hours | Quick start steps, optional video and guide links | `api/_lib/welcome.js` (`quickstart`) |
| 3 | +72 hours | Licence, refund and support links; offer of done-for-you setup and training | `api/_lib/welcome.js` (`faq`) |

Scope: one-time products that include a download, bundles included. Subscriptions have their own billing emails. Services get the getting-started form instead.

The playbook's "license keys" aren't in the repo. Email 1 gives the download links only.

## How it works

1. **At purchase** (`fulfil.js`, after the purchase email): `welcome.schedule` records emails 2 and 3 with their send times. Failure here is logged and doesn't fail the purchase. Scheduling is idempotent, so webhook retries are safe.
2. **On each run** (`functions/api/welcome-run.js`): every due email is sent once. A step is claimed before it is sent and marked done afterwards. A failed or skipped send is retried on the next run. If `RESEND_API_KEY` isn't set, sends are skipped and kept for later.

## Setup

Set these in Cloudflare Pages (Production):

| Variable | Required | Purpose |
|---|---|---|
| `WELCOME_RUN_SECRET` | Yes | At least 32 random characters. The runner refuses weaker secrets. Generate one with `openssl rand -hex 32`. |
| `WELCOME_VIDEO_URL` | No | Adds the video line to email 2 |
| `WELCOME_DOCS_URL` | No | Adds the guide line to email 2 |

Then schedule the runner. Pages has no built-in cron, so use any scheduler that can send an HTTP POST, for example an external cron service or a GitHub Actions `schedule:` workflow:

```bash
curl -sS -X POST https://snowseasonstech.store/api/welcome-run \
  -H "Authorization: Bearer $WELCOME_RUN_SECRET"
```

Run it every 30 minutes. The response shows `{ sent, failed, skipped, waiting }`.

Don't turn the schedule on until the video and guide links are ready, or until you are happy with email 2 without them.

## Known limits

- **Refunds aren't checked.** A buyer who is refunded still gets emails 2 and 3. Stripe's refund events aren't handled yet.
- **The pending list grows.** Finished series stay in the pending set, because the store has no way to remove one member. Each run skips them, but the list needs pruning once it is large.
- **No unsubscribe link.** These are order emails, not marketing. Check that this is acceptable under your email rules before sending.
- **Tested in memory only.** The unit tests use the in-memory store. Run one purchase end to end in Stripe test mode with a real Redis before going live.
