# Campaign plan: Christmas & New Year 2026–2027

Brand: snowseasonstech.store · Support: snowseasons@protonmail.com

## Goals

- Drive downloads of standalone tools.
- Sell the "Done-For-You" onboarding upgrade as a gift.
- Reach business owners planning the year ahead.

## Calendar

| Phase | Dates | Theme | Main actions |
|---|---|---|---|
| 1. Launch & discovery | Nov 25 – Dec 5 | "Gift Your Business a Better Workflow" | Homepage banner, wishlist polls on LinkedIn/IG/X, launch email to warm list |
| 2. 12 Days of Automation | Dec 6 – Dec 24 | "12 Days of Unmissable Upgrades" / "How to Start 2027 Stress-Free" | Rotating 24-hour deals Dec 12–23, short-form reels, DFY upgrade as the executive gift |
| 3. New Year Workflow Sale | Dec 26 – Dec 31 | "New Year, New Workflow" / "Got a Moment of Peace? Get Your Tech Ready" | Banner swap, long-form LinkedIn articles, final reminder Dec 30 |

## Conflicts with existing marketing (resolve before stage 2)

The repo already has two calendars that overlap this one.

| Existing item | Source | Clash with playbook |
|---|---|---|
| Small Business Weekend sale, **Nov 28–30**, 25% off nine software products with code `SHOPSMALL25` | `marketing/facebook-2026-11/sale-plan.md` | Playbook has no sale on those days, and its launch email goes out Nov 25. Two discounts running at once would confuse buyers. |
| Facebook calendar **Dec 7 – Jan 1**, 11 posts, reels Dec 10 and Dec 17 | `marketing/facebook-2026-12/posts.md`, `reels.md` | Its rule is **no prices in posts**. The playbook's reel and email copy quotes prices, and its Dec 12–23 deals need a price. Dec 24 is the holiday post; Dec 25 has no posts. |
| `LAUNCH_COUPON` storewide discount (env var) | `README.md`, `api/_lib/stripe.js` | While this is set, the site shows a discount on every product and hides promo-code entry. Stage 4 must confirm it is unset, or the playbook's deals would stack on top of it. |

**Proposed defaults (change if you decide otherwise):**
- Keep the Nov 28–30 weekend sale as the only sale until Dec 6. Phase 1 uses no prices, only the banner and polls.
- Keep the Facebook calendar's no-price rule. Put prices only in emails and on the site, which load prices live.
- Start flash deals Dec 12 and hold them off Dec 24–25.

## Phase 1 checklist (for stage 2 and after)

- [ ] Homepage banner: "Gift Your Business a Better Workflow" + `snowseasons@protonmail.com` (no prices)
- [ ] Wishlist poll posts on LinkedIn, IG and X (copy to write in stage 2)
- [ ] Launch email to the warm list (`email-sequence.md`, email 1). Send only after bundle decision (see `bundle-readiness.md`)

## Phase 2 checklist

- [ ] Flash deals Dec 12–23, one 24-hour deal per day (needs stage 4)
- [ ] Reels R1 and R2 (`reel-scripts.md`), posted alongside the Facebook calendar's Dec 10 and Dec 17 slots
- [ ] DFY upgrade pushed as the executive gift
- [ ] Emails 2 (Dec 6)

## Phase 3 checklist

- [ ] Banner switches to "New Year, New Workflow"
- [ ] Long-form LinkedIn article on holiday downtime automation
- [ ] Emails 3 (Dec 26) and 4 (Dec 30)
