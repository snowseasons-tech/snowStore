const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build } = require('../scripts/build-pages');

const root = path.join(__dirname, '..');
const list = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? list(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name))]));

test('dist contains only the public site', () => {
  const out = build({ root, out: fs.mkdtempSync(path.join(os.tmpdir(), 'dist-')) });
  const files = list(out).sort();
  for (const f of ['index.html', '404.html', 'success.html', 'cancel.html', 'privacy.html', 'refund.html', 'terms.html', 'page.css', '_headers',
    'storefront/portal.html', 'storefront/portal.js', 'storefront/styles.css', 'img/hero-banner.jpg', 'img/flake-1.png',
    'blog/index.html', 'blog/how-to-create-a-successful-stripe-store/index.html']) assert.ok(files.includes(f), `${f} missing`);
  const article = fs.readFileSync(path.join(out, 'blog/how-to-create-a-successful-stripe-store/index.html'), 'utf8');
  assert.match(article, /<link rel="canonical" href="https:\/\/snowseasonstech\.net\/blog\/how-to-create-a-successful-stripe-store\/">/);
  assert.match(article, /Treat webhooks as the source of truth/);
  assert.match(article, /Stripe store launch checklist/);
  const leaks = files.filter((f) => /^(api|functions|products|private-files|scripts|tests|node_modules|ecommerce-expert|\.)/.test(f) || /\.md$|\.env|package|vercel\.json/.test(f));
  assert.deepStrictEqual(leaks, []);
});

test('dist is rebuilt from scratch and fails on a missing index', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  assert.throws(() => build({ root: tmp, out: path.join(tmp, 'dist') }), /index\.html/);
});

test('security headers match across Functions and pages/_headers', async () => {
  const { SECURITY_HEADERS } = await import('../functions/_lib/headers.js');
  const { send } = await import('../functions/_lib/http.js');
  const parsed = Object.fromEntries(fs.readFileSync(path.join(root, 'pages/_headers'), 'utf8').split('\n')
    .filter((l) => /^\s+\S+: /.test(l)).map((l) => l.trim().split(/: (.*)/s).slice(0, 2)));
  assert.deepStrictEqual(parsed, SECURITY_HEADERS);
  const res = send(200, { ok: true });
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.strictEqual(res.headers.get(k), v);
});
