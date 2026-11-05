# Small Business Weekend Sale: Nov 28–30, 2026

| | |
|---|---|
| **Offer** | 25% off every software download |
| **Code** | `SHOPSMALL25` (customers type it at Stripe Checkout) |
| **Runs** | Sat Nov 28, 12:00am → Mon Nov 30, 11:59pm (your local time) |
| **Limit** | One use per customer |
| **Posts** | Fri Nov 27 teaser · Sat Nov 28 launch · Mon Nov 30 last day (posts 9–11 in `posts.md`) |

## What's included (9 products)

| Product | Stripe product |
|---|---|
| Local Launch — Local SEO Website Platform | `prod_VY9TUAccTT6xMm` |
| BookScan Live | `prod_VWvuAv0KIRcIeq` |
| Page Builder | `prod_VWvp2k6Km0zHCf` |
| Lead Generation Pipeline | `prod_VWuxBRkzXVcKY6` |
| Auto Blogger | `prod_VWvs2UB5zzpadc` |
| Auto Scheduler | `prod_VWvr03UiKKKzOV` |
| Invoice & Biller | `prod_VWvtth4P0PijFY` |
| SaaS Financial Projection Engine | `prod_VWvzD2VFXydATp` |
| GBP Analytics Dashboard | `prod_VWsoI3mBrl03a2` |

**Not included:** services and monthly plans (website management, social media, API work, intelligence platforms), the Founders membership, bundles, and the courses. Limiting the code to these products in Stripe makes it fail on anything else.

## Stripe setup (do this in the Stripe Dashboard)

1. **Check that `LAUNCH_COUPON` is not set** in Cloudflare Pages (Production). While it's set, the site applies that coupon automatically and Stripe hides the promo-code box, so `SHOPSMALL25` would have nowhere to go.
2. **Create the coupon:** Product catalog → Coupons → New.
   - Type: Percentage, **25%**
   - Duration: **Once**
   - Apply to specific products: pick the 9 products above
   - Redemption limits: **Limit the date range**, ending Nov 30 at 11:59pm
3. **Add the promotion code** on that coupon:
   - Code: `SHOPSMALL25`
   - Check **Limit to one redemption per customer**
   - Expiration: Nov 30 at 11:59pm
   - Leave it **inactive** until Saturday morning, or set it active and rely on the post timing. Stripe doesn't support a start date, so if you want nobody to use it early, switch it to active on Saturday.
4. **Test it in test mode first:** create the same coupon and code in test mode, open a product on the Preview deployment, enter the code at Checkout with test card 4242 4242 4242 4242, and check that the total drops by 25%. Then try it on a service to confirm Stripe rejects it.

## After the sale

- Stripe ends the code automatically on Nov 30. Nothing on the site needs to change.
- Check results on Tuesday Dec 1: Stripe → Coupons → the coupon shows how many times it was redeemed.
