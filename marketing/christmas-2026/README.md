# Christmas & New Year 2026–2027 campaign

Source playbook: `/root/.claude/uploads/24692c34-48cc-5528-babd-c04154c4fc66/f3102521-christmas_campaign_playbook.md` (not in the repo; its content is carried into these files).

This folder is the campaign workspace. It holds planning and draft copy only. Nothing here changes the live site, Stripe prices, or the catalog.

## Files

| File | What it covers | Status |
|---|---|---|
| [campaign-plan.md](campaign-plan.md) | Reconciled 3-phase calendar, and the conflicts with existing marketing | Draft, needs owner decisions |
| [bundle-readiness.md](bundle-readiness.md) | Playbook bundles A/B/C mapped to the catalog, with blockers | Draft, blocked on decisions |
| [email-sequence.md](email-sequence.md) | Four campaign emails (Nov 25, Dec 6, Dec 26, Dec 30) | Draft copy, prices held as placeholders |
| [reel-scripts.md](reel-scripts.md) | Two short-form video scripts | Draft, no footage yet |

## Stages

| Stage | Scope | State |
|---|---|---|
| 1. Plan & content | Calendar, bundle mapping, copy and scripts (this folder) | Done in this branch |
| 2. Homepage banner | Campaign announcement bar on `index.html`, behind a single config switch, no prices | Next |
| 3. Interactive tools | Workflow quiz and ROI calculator as static components on the homepage | After stage 2 |
| 4. Offers & checkout | Bundle products in the catalog and Stripe, Phase 2 flash deals | Blocked: bundles are drafts with unfinished parts (see `bundle-readiness.md`) |
| 5. Gift certificates | Custom PDF certificates with `SNOW-2027-XXXX` codes | Not started: needs a backend for code redemption |
| 6. Post-purchase emails | Welcome series (immediate, +24h, +72h) | Not started: needs the email sender wired to order events |

## Decisions needed before stage 4

1. Are bundles one-time downloads (playbook) or monthly subscriptions (the catalog's drafts)?
2. Which Bundle C hero product is meant? The playbook's "React Auto Scheduler" isn't in the catalog.
3. Does the Nov 28–30 Small Business Weekend sale run as planned, and does it stack with the playbook's Dec 12–23 flash deals?
