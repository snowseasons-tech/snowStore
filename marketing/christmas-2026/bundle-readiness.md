# Bundle readiness: playbook offers vs. the catalog

Checked against `api/_lib/catalog.js` on branch `claude/upbeat-clarke-4ein8v`.

## Playbook bundles

| Bundle | Hero product | Free bonus | Regular | Holiday | Catalog status |
|---|---|---|---|---|---|
| A · Outgrown Spreadsheets | Store Inventory Tracker | Invoice Generator ($149) | $348 | $199 | `inventory-tracker` and `invoice-generator` are **live** as separate products. No bundle exists. |
| B · Solopreneur Salesperson | Lead Generation Pipeline | Auto Blogger ($199) | $448 | $249 | `lead-generator` and `blog-gen` are **live**. No bundle exists. |
| C · Small But Growing Team | React Auto Scheduler | 50% off setup and VIP training | $699 | $399 | The catalog's **Auto Scheduler** is `booking-app` and is **live**. It is probably the hero meant here, but the playbook says "React", so confirm. The 50% off setup and training is a service, not a product. |

## Status after stage 4

The playbook's one-time bundles now exist in the catalog as hidden entries, so nothing can be bought until a Stripe product is linked.

| Entry | Contents | Price in catalog (`proposedPrice`) | State |
|---|---|---|---|
| `christmas-solopreneur` | Lead Generation Pipeline + Auto Blogger | $249 | Hidden, no Stripe product |
| `christmas-small-team` | Auto Scheduler (`booking-app`) | $399 | Hidden, no Stripe product |
| Bundle A (Outgrown Spreadsheets) | Store Inventory Tracker + Invoice Generator | $199 | Not in the catalog (see below) |

## Why Bundle A is left out

The Store Inventory Tracker (`inventory-tracker`) is **retired**. The catalog validator refuses a bundle that includes a retired product, and the store retired it on purpose. Adding it back would reverse that decision. The options are:

- Bring the tracker back on sale, then add Bundle A with it.
- Make A from the Invoice Generator alone. That is a weaker offer than the playbook's.
- Drop A from the Christmas offers.

## Other notes

- Bundle C is a single product. The "50% off setup and VIP training" bonus is a service, so it can't be in the catalog and has to be sold separately.
- The catalog's subscription bundles (`business-launch`, `lead-generation-pro`, and so on) are unchanged and still drafts.
- One-time bundles need their own rules: they are not subscriptions. The code change is in `api/_lib/entitlements.js` (`isMembership`) and `scripts/validate-store-items.js`.

Until the decisions above are made, the playbook's prices stay as placeholders in `email-sequence.md`, and nothing is published.
