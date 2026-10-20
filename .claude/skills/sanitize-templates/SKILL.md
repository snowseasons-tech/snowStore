---
name: sanitize-templates
description: Scan Snow Seasons product templates and deliverables (products/, HTML templates, ZIPs) for secrets, real personal info, the owner's own details and junk files, then fix them automatically before the file is uploaded, sold or given away. Use this whenever the user wants to sanitize, scrub, clean up, de-identify or "check for anything sensitive" in a template or product, is preparing a deliverable or ZIP, is adding a new product to the store or catalog, is about to run scripts/upload.sh, or asks "is this safe to sell/share", even if they never say the word "sanitize".
---

# Sanitize templates

Products in this repo are sold or given away to strangers, so anything left in them goes out with every copy. That includes a live API key, a real customer's email, a path like `/home/<user>/...` or a stray `__pycache__`. Copies already uploaded or sold can't be recalled. This skill finds those leaks and fixes them in place before the next upload.

The user's standing choice is **fix automatically**: make the changes, then report what changed. Don't ask before each edit. Still stop and ask before anything outward-facing, like uploading, committing or pushing.

## 1. Pick the targets

- If the user names a product, scan its folder under `products/` and its built deliverable, if there is one.
- Otherwise scan all of `products/`.
- Deliverables are listed in `api/_lib/catalog.js` (`fileKey`/`filename`). If the user points to a ZIP they are about to upload, scan the ZIP itself, since that is what customers actually get. It can contain files the source folder doesn't, and miss ones it does.
- The free kit is `products/free-landing-page/index.html`.

## 2. Run the scanner

From the repo root:

```sh
python3 -I .claude/skills/sanitize-templates/scripts/scan.py products/<name> [more paths or .zip files]
```

It reports four categories: `SECRET`, `PERSONAL`, `OWNER` and `JUNK`, each with `file:line`. It reads the owner's private terms at run time and never stores them: values in `.env` and `managed/ops.env`, the git name and email, the home directory, the hostname, and the brand name from `SITE_URL`. Pass `--term "..."` for anything else the user wants flagged (for example a client's name). Use `--json` if you want to process the results.

Secret values are masked in its output. Keep it that way. Never print, quote or copy a real secret into chat, a commit message or a report; refer to it by kind and location. Leaking it while cleaning it up defeats the point.

The scanner is a net, not a judge. It can't tell a real address from an obviously fictional sample, and it doesn't read meaning: a real client's company name, or an internal note like "TODO: ask Dave about the Acme contract", won't match a pattern. So after the scan, skim each target file yourself for content that only makes sense to the owner.

## 3. Decide what each finding is

For every finding, decide whether it is a **leak** (fix it), **intentional** (keep it, and say why in the report), or a **false positive** (ignore it).

- **Secrets** are always leaks, including test-mode keys: they still identify the account. Placeholders like `YOUR_API_KEY` and `process.env.X` are fine.
- **Personal info** is a leak when it could be a real person: a real-looking email domain (gmail.com, a company domain), a phone number without 555, or names and addresses that look copied from real data such as an order, a lead list or a client. Clearly invented sample data using `example.com`, 555 numbers and generic names is fine, which is why demo data in the invoice and dashboard templates usually stays.
- **Owner details** depend on where they appear:
  - **Inside the template itself** (the HTML, code or sample content the buyer edits and republishes as their own), the owner's brand, domains, email, paths, bucket, Stripe IDs and IPs are all leaks. Buyers would otherwise ship Snow Seasons details on their own sites.
  - **In a product README**, one support or where-to-buy line pointing at the public store is intentional, because buyers need it. Normalize it to the `SITE_URL` domain. Other own details in the README (other domains, personal email, internal paths, "not connected to our systems" notes that name the company) are leaks.
- **Junk** is always a leak in a deliverable.

## 4. Fix automatically

Edit the files directly. The goal is a template that still works and reads naturally, so replace the leaks rather than deleting them.

| Found | Replace with |
|---|---|
| API key, token, password | A placeholder such as `YOUR_STRIPE_SECRET_KEY`, or read it from config or env (`process.env.X`, `os.environ["X"]`). Keep the code path working. |
| Real email | `you@example.com`, `hello@example.com` (keep the role: support@, billing@) |
| Real person or company name | Neutral samples: "Jane Doe", "Example Co", "Your Brand" |
| Phone | `(555) 010-0100` style numbers |
| Street address | `123 Main St, Springfield` |
| Owner brand in a template | "Your Brand", or the template's existing placeholder style |
| Wrong or extra owner domain | The public store URL in a README support line, otherwise `example.com` |
| Home/internal path | A relative path, `~/...`, or `/path/to/...` |
| LAN IP / internal host | `127.0.0.1` or `example.internal` |
| Stripe / bucket IDs | `price_XXXXXXXX`, `your-bucket` |
| Real records (leads, orders, clients) | A few clearly fictional rows in the same format |

Match the file's existing placeholder style when it has one.

For junk:
- **Regenerable junk** (`__pycache__`, `.pyc`, `.DS_Store`, logs, `node_modules`, editor folders): delete it from the product folder. If git tracks it, also run `git rm -r --cached <path>`.
- **`.env` files and anything else that can't be regenerated:** don't delete them, because the user may need the values. Exclude them from the deliverable and tell the user.

When a stray file doesn't belong to a product at all, don't rewrite or delete it. For example, `products/gumroad-scrapper.py` looked like a pasted terminal transcript. Report it and suggest moving it out of `products/`.

For a ZIP: extract it into a new empty folder in the scratchpad, fix the copies, rebuild the ZIP with the same top-level layout, and leave the original next to it as `<name>.orig.zip` until the user confirms.

## 5. Verify

1. Re-run the scanner on the same targets. Only findings you deliberately kept should remain.
2. Check that each edited file still works:
   - JS/MJS: `node --check <file>`
   - Python: `python3 -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" <file>`. This avoids `py_compile`, which writes new `__pycache__` folders.
   - Inline scripts in HTML: extract them and run `node --check`.
   - JSON: `python3 -m json.tool <file>`
3. Run `git diff --stat products/` so the report lists exactly what changed.

## 6. Report

Keep the report short, and lead with anything that needs the user's action:

- **Needs action:**
  - **A real secret was found.** Say it must be rotated at the provider. Editing the file doesn't remove it from git history, from copies already uploaded to the bucket, or from copies customers already downloaded.
  - **A deliverable changed.** It needs to be re-uploaded with `scripts/upload.sh <file> <fileKey>`, and its `sha256` (and `version`) in `api/_lib/catalog.js` updated. Offer to do it, but don't upload, commit or push without a yes.
- **Fixed:** one line per file: what kind of leak, and what it was replaced with. Give the location, never the secret.
- **Kept on purpose:** findings you left alone, and why (for example "README support link to the store", "fictional sample client in the invoice demo").
