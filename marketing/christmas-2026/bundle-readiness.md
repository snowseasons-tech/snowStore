# Bundle readiness: playbook offers vs. the catalog

Checked against `api/_lib/catalog.js` on branch `claude/upbeat-clarke-4ein8v`.

## Playbook bundles

| Bundle | Hero product | Free bonus | Regular | Holiday | Catalog status |
|---|---|---|---|---|---|
| A · Outgrown Spreadsheets | Store Inventory Tracker | Invoice Generator ($149) | $348 | $199 | `inventory-tracker` and `invoice-generator` are **live** as separate products. No bundle exists. |
| B · Solopreneur Salesperson | Lead Generation Pipeline | Auto Blogger ($199) | $448 | $249 | `lead-generator` and `blog-gen` are **live**. No bundle exists. |
| C · Small But Growing Team | React Auto Scheduler | 50% off setup and VIP training | $699 | $399 | The catalog's **Auto Scheduler** is `booking-app` and is **live**. It is probably the hero meant here, but the playbook says "React", so confirm. The 50% off setup and training is a service, not a product. |

## What's blocking a bundle sale

1. **Model mismatch.** The playbook sells bundles as one-time packages. The catalog's bundles are **monthly subscriptions** in draft (`business-launch` $149/mo, `lead-generation-pro` $249/mo, and so on). Neither the bundle IDs nor the prices match the playbook.
2. **Drafts can't be sold.** Every bundle has `draft: true`. `scripts/create-bundles.js` refuses to create a bundle that still has `pending` parts, and checkout returns 503 for drafts (`tests/bundles.test.js`).
3. **Pending parts.** `hosted/BUNDLE-GAPS.md` says none of the six bundles is ready to release.
4. **Missing products.** Bundle C's hero product doesn't exist in the catalog.

## What can sell now without changing the catalog

- Individual live products at list price, with the Nov 28–30 weekend sale code.
- A "bundle" offer made only from live one-time products (A's two products, B's two products). Stripe needs a new product and price for that, and the catalog needs an entry. Blocked on the decision below.

## Decisions needed

1. Are the Christmas bundles one-time packages, or do they follow the catalog's subscription model? Each option needs different Stripe setup.
2. Is Bundle C's hero the catalog's Auto Scheduler (`booking-app`), or a different "React" product? If the Auto Scheduler, C is buildable from live products. If not, drop C from the Phase 2 offers.
3. Should Bundles A and B be sold as one-time packages now, built from live products? If yes, this becomes stage 4.

Until these are answered, the playbook's prices stay as placeholders in `email-sequence.md` and are not published.
