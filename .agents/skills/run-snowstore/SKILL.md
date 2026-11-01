---
name: run-snowstore
description: Build, run and drive the Snow Seasons storefront (this repo) locally - the static site, the Cloudflare Pages Functions under /api, the customer portal, and the standalone product pages in products/ such as the BI dashboard. Use when asked to run or start the site, test a Function (/api/kit, /api/login, /api/app-download...), take a screenshot of the storefront, portal or a product page, click through a UI change in a real browser, or check phone/desktop layouts.
---

Start the site with `.Codex/skills/run-snowstore/dev.sh` (wrangler + a fake Upstash, no real secrets), then drive pages with `.Codex/skills/run-snowstore/driver.mjs`, a dependency-free headless-Chrome driver that reads commands on stdin. Product pages in `products/` don't need the server: point the driver at their `file://` path. All paths are relative to the repo root.

## Prerequisites

Verified with Node 22.22.1, Google Chrome 155 (`google-chrome` on PATH, or set `CHROME=`), wrangler 4.151.2 (run through `npx`, not a project dependency), plus `curl`, `setsid` and `python3`. The driver needs Node 22 for its built-in `WebSocket`.

```bash
node --version && google-chrome --version && npx --yes wrangler@4.151.2 --version
```

## Setup

```bash
npm install
```

No env vars or `.env` needed: `dev.sh` passes local stand-ins (fake store on :8790, bucket host `r2.example.invalid`) and deliberately ignores the repo's `.env`.

## Run (agent path)

```bash
.Codex/skills/run-snowstore/dev.sh start   # builds dist/, starts fake store :8790 + wrangler :8788, waits (~7 s)
.Codex/skills/run-snowstore/dev.sh check   # 7 curl checks: pages, /api/kit, subscriber written, /api/me 401
```

Drive the storefront - kit email signup, end to end:

```bash
node .Codex/skills/run-snowstore/driver.mjs <<'EOF'
stub r2.example.invalid
nav http://127.0.0.1:8788/
wait-for #kit-form
screenshot home
scroll-to #kit
fill #kit-email sam@example.com
click #kit-form button
wait-text Your download is starting
screenshot kit-signed-up
stubbed
assert location.pathname === '/'
assert-no-errors
EOF
.Codex/skills/run-snowstore/dev.sh keys     # shows subscriber:sam@example.com and the rate-limit counter
```

Customer portal - create an account in the fake store, then sign in (wrong password first) and download:

```bash
.Codex/skills/run-snowstore/dev.sh seed-user pat@example.com bookscan     # password: local-pass-123
node .Codex/skills/run-snowstore/driver.mjs <<'EOF'
stub r2.example.invalid
nav http://127.0.0.1:8788/storefront/portal
wait-for #login
fill input[name=email] pat@example.com
fill input[name=password] wrong-password-1
click #login button[type=submit]
wait-for #login-msg
eval document.querySelector('#login-msg').textContent
fill input[name=password] local-pass-123
click #login button[type=submit]
wait-for #logout
wait-text BookScan Live
screenshot portal-signed-in
click a[href^="/api/app-download?product=bookscan"]
sleep 1000
stubbed
EOF
```

A product page straight from disk - the BI dashboard at phone and desktop size (needs internet: it loads Tailwind, Chart.js and map data from CDNs):

```bash
node .Codex/skills/run-snowstore/driver.mjs <<EOF
viewport 390 844 mobile
nav file://$PWD/products/bi-dashboard/index.html
wait-for #totalLeadsCount
click #navToggle
wait-for #sidebar:not(.-translate-x-full)
sleep 300
screenshot dashboard-phone-menu
click #nav-leads
wait-text Add Opportunity
sleep 300
screenshot dashboard-phone-leads
viewport 1280 800
click #nav-overview
assert document.getElementById('pageTitle').textContent === 'Operations Overview'
wait-js state.charts.clientsMap
scroll-to #leadsMap
screenshot dashboard-maps
assert-no-errors
EOF
```

Screenshots land in `/tmp/snowstore-shots/<name>.png` (override with `SHOTS_DIR`). **Open them and look** - the driver can't tell a half-animated or blank page from a good one. The driver exits 1 at the first failing line and prints `FAIL line N`.

```bash
.Codex/skills/run-snowstore/dev.sh stop    # ends npm, wrangler and workerd together, frees :8788 :8790 :9229
```

Logs: `/tmp/snowstore-dev/site.log` (wrangler, one line per request, Function errors in red), `/tmp/snowstore-dev/store.log` (every store command).

| driver command | what it does |
|---|---|
| `viewport <w> <h> [mobile]` | emulate a screen (default 1280 800) |
| `media prefers-color-scheme=dark ...` | emulate media features |
| `nav <url>` | load http:// or file:// and wait for `load` |
| `wait-for <css> [ms]` / `wait-text <text>` / `wait-js <expr>` | poll until visible / present / truthy |
| `click <css>` | real mouse click at the element's center, after it stops moving |
| `fill <css> <value>` | type into an input (selects: set + `change`). Selector is one word |
| `press <key>` | `Enter`, `Escape`, `Tab`, arrows |
| `scroll-to <css>` | `scrollIntoView` (needed for pages that scroll inside `<main>`) |
| `eval <js>` / `assert <js>` | print a value / fail unless truthy |
| `stub <host>` / `stubbed` | answer requests to a host with a dummy download / list them |
| `screenshot [name]` | PNG of the viewport |
| `errors` / `assert-no-errors` | page exceptions and `console.error` |

## Direct invocation (one Function, no server)

For a change inside a single Function, import it and call the handler with the test suite's fake store:

```bash
node --input-type=module -e '
import { createRequire } from "node:module"; const require = createRequire(process.cwd() + "/");
const up = require("./tests/fake-upstash.js")();
const env = { UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "t", S3_ENDPOINT: "https://r2.example.invalid", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" };
const { onRequestPost } = await import("./functions/api/kit.js");
const res = await onRequestPost({ env, request: new Request("https://x.test/api/kit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "pat@example.com" }) }) });
console.log(res.status, (await res.text()).slice(0, 70), [...up.data.keys()]);
up.restore();'
```

## Run (human path)

`dev.sh start`, then open http://127.0.0.1:8788 in a browser; `dev.sh stop` when done.

## Test

```bash
npm test        # 47 tests, no services needed
npm run lint
```

## Gotchas

- **Wrangler loads the repo's real `.env`** ("Using secrets defined in .env" in the log) and `--env-file` doesn't replace it for `pages dev`. `dev.sh` sets `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false` and passes `--binding K=V` instead. If you launch wrangler by hand, do the same, or local runs use the production bucket keys.
- **Killing the :8788 listener does not stop wrangler.** npm, wrangler and workerd keep running and workerd keeps the inspector port 9229. `dev.sh` runs each server under `setsid` and `stop` kills the whole process group. Don't `pkill -f wrangler`-style patterns: they can match your own shell.
- **Prices and checkout don't work locally.** `/api/products` and `/api/checkout` need a real Stripe key (`STRIPE_SECRET_KEY is not set` in site.log); price slots render empty and Buy fails. Everything backed by the store works: kit signup, portal login/session/downloads, order and download counters.
- **Signed download URLs point at `r2.example.invalid`.** Following one in the browser replaces the page with Chrome's error page, so run `stub r2.example.invalid` first; `stubbed` then proves the download was requested.
- **`.html` URLs redirect.** `/storefront/portal.html` answers 308 to `/storefront/portal`, locally and in production. Navigate to the clean URL.
- **Selectors with spaces:** `click`, `wait-for` and `scroll-to` take the rest of the line; `fill` takes one word (`input[name=email]`, `#login>input`), then the value.
- **Animations:** the BI dashboard's sidebar slides for 200 ms. `click` waits for its target to stop moving, but add `sleep 300` before a screenshot taken right after opening/closing the menu, or you capture it mid-slide.
- **Lazy images** (`loading="lazy"` product thumbnails) are blank in a screenshot until scrolled into view.
- **The dashboard scrolls inside `<main>`,** not the window: use `scroll-to <css>`, not `window.scrollTo`.
- **`eval` has no top-level `await`;** to wait for async state use `wait-js <expr>`.
- **The Codex in Chrome extension can't reach servers started here** (it showed an error page for 127.0.0.1 and localhost); use the headless driver.

## Troubleshooting

- **`/api/kit` or `/api/me` return 500, site.log says `Persistent store not configured`**: wrangler started without the store bindings (launched by hand?). Use `dev.sh start`.
- **`FAIL ... wait-text` after a `click` that printed `ok`**: the click hit something else. Check the selector (one word for `fill`), and `eval` `document.elementFromPoint(x, y)` at the target's center.
- **`site did not come up`**: the tail of `/tmp/snowstore-dev/site.log` is printed; a leftover wrangler from a manual launch is the usual cause - `dev.sh stop`, then find and kill the stray `wrangler pages dev` processes by PID.
