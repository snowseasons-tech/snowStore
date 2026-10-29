const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { readDetails, readHomepage, rules, agentFacts, parseModelfile, loadAgents, checkFindings, renderMarkdown, parseArgs, tierOf } = require('../scripts/pricing-audit');

// A small store: facts in the shape collect() returns, with every icon present unless listed in missingIcons.
function store({ catalog = {}, live = [], details = {}, homepage = [], missingIcons = [], liveError = null } = {}) {
  return { catalog, live, liveError, details, homepage, iconExists: (rel) => !missingIcons.includes(rel) };
}
const price = (id, name, amount, extra = {}) => ({ id, name, amount, currency: 'usd', interval: 'month', ...extra });
const codes = (findings) => findings.map((f) => f.code).sort();

test('flags catalog products that are not on sale or have no Stripe product', () => {
  const f = store({
    catalog: { a: { name: 'A', stripeProduct: 'prod_a' }, b: { name: 'B' }, old: { name: 'Old', retired: true } },
    live: [],
  });
  const found = rules(f);
  assert.deepStrictEqual(codes(found), ['no-stripe-product', 'not-on-sale']);
  assert.ok(found.every((x) => x.severity === 'error'));
});

test('skips price checks and reports an error when live prices could not load', () => {
  const found = rules(store({ catalog: { a: { name: 'A', stripeProduct: 'prod_a' } }, liveError: 'HTTP 500' }));
  assert.deepStrictEqual(codes(found), ['prices-unavailable']);
});

test('flags a catalog kind that disagrees with the Stripe price, and mixed one-time plus recurring prices', () => {
  const f = store({
    catalog: { sub: { name: 'Sub', kind: 'subscription', stripeProduct: 'p1' }, once: { name: 'Once', stripeProduct: 'p2' } },
    live: [
      price('sub', 'Sub', 1000, { interval: null, periods: [{ period: '12m', amount: 9000, interval: 'year', intervalCount: 1 }] }),
      price('once', 'Once', 500),
    ],
    details: { sub: { category: 'X', blurb: 's' }, once: { category: 'Y', blurb: 'o' } },
  });
  const c = codes(rules(f));
  assert.strictEqual(c.filter((x) => x === 'kind-mismatch').length, 2);
  assert.ok(c.includes('mixed-billing'));
});

test('flags tiers out of order, a missing numbered tier, and prepay options with no saving', () => {
  const cat = (n) => ({ name: `Social ${n}`, kind: 'subscription', stripeProduct: `p${n}` });
  const f = store({
    catalog: { 'social-1': cat(1), 'social-2': cat(2), 'social-4': cat(4) },
    live: [
      price('social-1', 'Social 1', 300, { periods: [{ period: '3m', amount: 900, interval: 'month', intervalCount: 3 }] }),
      price('social-2', 'Social 2', 250, { periods: [{ period: '3m', amount: 700, interval: 'month', intervalCount: 3 }] }),
      price('social-4', 'Social 4', 600, { periods: [{ period: '3m', amount: 1700, interval: 'month', intervalCount: 3 }] }),
    ],
    details: { 'social-1': { category: 'Social', blurb: '1' }, 'social-2': { category: 'Social', blurb: '2' }, 'social-4': { category: 'Social', blurb: '4' } },
  });
  const found = rules(f);
  assert.ok(found.some((x) => x.code === 'tier-order' && x.products.join() === 'social-1,social-2'));
  assert.ok(found.some((x) => x.code === 'tier-gap' && /tier 3 is missing/.test(x.message)));
  assert.deepStrictEqual(found.filter((x) => x.code === 'no-period-saving').map((x) => x.products[0]), ['social-1']);
});

test('flags billing periods missing from some plans in a family', () => {
  const f = store({
    catalog: { a: { name: 'A', kind: 'subscription', stripeProduct: 'p1' }, b: { name: 'B', kind: 'subscription', stripeProduct: 'p2' } },
    live: [price('a', 'A', 100, { periods: [{ period: '12m', amount: 1000, interval: 'year', intervalCount: 1 }] }), price('b', 'B', 200)],
    details: { a: { category: 'Web', blurb: 'a' }, b: { category: 'Web', blurb: 'b' } },
  });
  const gap = rules(f).filter((x) => x.code === 'period-gap');
  assert.deepStrictEqual(gap.map((x) => x.products[0]), ['b']);
  assert.match(gap[0].message, /12m/);
});

test('flags identical copy on products with different prices, but not a shared notes list', () => {
  const notes = ['Billed separately'];
  const f = store({
    catalog: { m1: { name: 'M1', stripeProduct: 'p1' }, m2: { name: 'M2', stripeProduct: 'p2' }, i1: { name: 'I1', stripeProduct: 'p3' }, i2: { name: 'I2', stripeProduct: 'p4' } },
    live: [price('m1', 'M1', 49), price('m2', 'M2', 99), price('i1', 'I1', 500, { interval: null }), price('i2', 'I2', 900, { interval: null })],
    details: { m1: { category: 'M', blurb: 'Same text' }, m2: { category: 'M', blurb: 'Same text' }, i1: { category: 'I', blurb: 'one' }, i2: { category: 'I', blurb: 'two' } },
    homepage: [
      { id: 'i1', name: 'I1', category: 'I', blurb: 'one', features: notes },
      { id: 'i2', name: 'I2', category: 'I', blurb: 'two', features: notes },
    ],
  });
  const dup = rules(f).filter((x) => x.code === 'same-copy-different-price');
  assert.deepStrictEqual(dup.map((x) => x.products.join()), ['m1,m2']);
});

test('flags pages that reference unknown, unsold or icon-less products', () => {
  const f = store({
    catalog: { a: { name: 'A', stripeProduct: 'p1' }, b: { name: 'B', stripeProduct: 'p2' } },
    live: [price('a', 'A', 100)],
    details: { a: { category: 'C', blurb: 'a', icon: 'gone' }, typo: { category: 'C' } },
    homepage: [{ id: 'b', name: 'B' }, { id: 'ghost', name: 'Ghost' }],
    missingIcons: ['gone.webp'],
  });
  const c = codes(rules(f));
  for (const code of ['details-unknown', 'homepage-not-on-sale', 'homepage-unknown', 'icon-missing', 'not-on-sale']) assert.ok(c.includes(code), code);
});

test('on-sale products without a DETAILS entry are flagged; errors sort first', () => {
  const found = rules(store({ catalog: { a: { name: 'A', stripeProduct: 'p' }, z: { name: 'Z', stripeProduct: 'q' } }, live: [price('a', 'A', 100)] }));
  assert.ok(found.some((x) => x.code === 'no-details'));
  assert.strictEqual(found[0].severity, 'error');
});

test('tierOf reads numbered and named tiers', () => {
  assert.strictEqual(tierOf('social-media-3'), 3);
  assert.strictEqual(tierOf('api-integration-enterprise'), 4);
  assert.strictEqual(tierOf('api-management-advanced'), 3);
  assert.strictEqual(tierOf('website-management-primary'), null);
});

test('reads DETAILS and the homepage PRODUCTS list from this repo', () => {
  const root = path.join(__dirname, '..');
  const details = readDetails(fs.readFileSync(path.join(root, 'products.html'), 'utf8'));
  const homepage = readHomepage(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
  assert.ok(details['api-integration-basic'] && details['api-integration-basic'].category);
  assert.ok(homepage.length > 5 && homepage.every((p) => p.id && p.name));
});

test('agent facts carry prices, savings and copy for each product on sale', () => {
  const f = store({
    catalog: { a: { name: 'A', kind: 'subscription', stripeProduct: 'p' }, b: { name: 'B', stripeProduct: 'q' } },
    live: [price('a', 'A', 1000, { periods: [{ period: '6m', amount: 5400, interval: 'month', intervalCount: 6 }] })],
    details: { a: { category: 'C', blurb: 'Does a thing' } },
  });
  const facts = agentFacts(f);
  assert.deepStrictEqual(facts.products[0].prices, [{ billing: 'monthly', price: '$10.00' }, { billing: 'every 6 months', price: '$54.00', savingVsMonthly: '10%' }]);
  assert.strictEqual(facts.products[0].description, 'Does a thing');
  assert.deepStrictEqual(facts.notOnSale, [{ id: 'b', name: 'B' }]);
});

test('agent findings that name unknown products are marked unverified', () => {
  const out = checkFindings({ findings: [
    { severity: 'high', products: ['a', 'made-up'], issue: 'Gap', evidence: 'e', suggestion: 's' },
    { severity: 'bogus', products: [], issue: 'Other', evidence: '', suggestion: '' },
    { severity: 'low', products: ['a'], issue: '   ' },
  ] }, new Set(['a']));
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out[0].products, ['a']);
  assert.match(out[0].unverified, /made-up/);
  assert.strictEqual(out[1].severity, 'low');
  assert.deepStrictEqual(checkFindings(null, new Set()), []);
});

test('every agent Modelfile parses, uses a Qwen model and asks for a focused review', () => {
  const agents = loadAgents();
  assert.deepStrictEqual(agents.map((a) => a.name), ['copy', 'coverage', 'ladder']);
  for (const a of agents) {
    assert.match(a.from, /qwen/i);
    assert.ok(a.options.num_ctx >= 16384 && a.options.temperature <= 0.4);
    assert.match(a.system, /Work only from the JSON/);
  }
  assert.throws(() => parseModelfile('FROM x'), /SYSTEM/);
});

test('report lists rule checks and agent results; options parse', () => {
  const md = renderMarkdown({
    store: 'https://example.com', at: 'now', products: 1,
    rules: [{ severity: 'error', code: 'not-on-sale', products: ['a'], message: 'A is not on sale.' }],
    agents: [{ name: 'coverage', model: 'qwen', seconds: 3, findings: [{ severity: 'medium', products: ['a'], issue: 'Gap', evidence: 'e', suggestion: 's', unverified: 'x' }] }, { name: 'ladder', error: 'Ollama is down' }],
  });
  assert.match(md, /1 errors, 0 warnings/);
  assert.match(md, /Agent: coverage/);
  assert.match(md, /Unverified: x/);
  assert.match(md, /Skipped: Ollama is down/);
  assert.deepStrictEqual(parseArgs(['--no-agents', '--agent', 'copy', '--ollama', 'host:1']), { ...parseArgs([]), agents: false, only: 'copy', ollama: 'http://host:1' });
  assert.throws(() => parseArgs(['--bogus']), /Unknown option/);
});

test('agent findings that only restate a rule check are recognised', () => {
  const { repeatsRule } = require('../scripts/pricing-audit');
  const ruleFindings = [{ code: 'period-gap', products: ['s1', 's5'] }, { code: 'same-copy-different-price', products: ['m1', 'm2'] }];
  assert.ok(repeatsRule({ products: ['s1'], issue: 'No 12-month billing option', evidence: '' }, ruleFindings));
  assert.ok(repeatsRule({ products: ['m1', 'm2'], issue: 'Identical descriptions', evidence: '' }, ruleFindings));
  assert.ok(!repeatsRule({ products: ['s1', 'x'], issue: 'No yearly billing', evidence: '' }, ruleFindings));
  assert.ok(!repeatsRule({ products: ['s1'], issue: 'Requires a plan you cannot buy', evidence: '' }, ruleFindings));
  assert.ok(!repeatsRule({ products: [], issue: 'Billing', evidence: '' }, ruleFindings));
});

test('homepage features without a title are passed to agents as terms, not as what the plan includes', () => {
  const f = store({
    catalog: { a: { name: 'A', stripeProduct: 'p' }, b: { name: 'B', kind: 'subscription', stripeProduct: 'q' } },
    live: [price('a', 'A', 100, { interval: null }), price('b', 'B', 50)],
    homepage: [
      { id: 'a', name: 'A', blurb: 'x', features: ['Fees billed separately'] },
      { id: 'b', name: 'B', blurb: 'y', featuresTitle: 'Includes', features: ['8 posts'], notes: ['One account'], coverage: [['Support', '45 min']] },
    ],
  });
  const [a, b] = agentFacts(f).products;
  assert.strictEqual(a.whatYouGet, undefined);
  assert.deepStrictEqual(a.goodToKnow, ['Fees billed separately']);
  assert.deepStrictEqual(b.whatYouGet, ['8 posts', 'Support: 45 min']);
  assert.deepStrictEqual(b.goodToKnow, ['One account']);
});

test('runAgent reads a streamed Ollama reply, even when lines arrive split across chunks', async () => {
  const http = require('http');
  const { runAgent } = require('../scripts/pricing-audit');
  let request;
  const reply = JSON.stringify({ findings: [{ severity: 'low', products: ['a'], issue: 'Gap', evidence: 'e', suggestion: 's' }] });
  const lines = [...reply.match(/.{1,12}/g).map((c) => JSON.stringify({ message: { content: c }, done: false })), JSON.stringify({ done: true })].join('\n') + '\n';
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      request = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      const parts = lines.match(/[\s\S]{1,37}/g);
      const next = () => (parts.length ? (res.write(parts.shift()), setImmediate(next)) : res.end());
      next();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const agent = { from: 'qwen-test', system: 'sys', options: { temperature: 0.2 } };
    const { raw } = await runAgent(agent, 'prompt', { ollama: `http://127.0.0.1:${server.address().port}`, think: false });
    assert.deepStrictEqual(raw, JSON.parse(reply));
    assert.strictEqual(request.stream, true);
    assert.strictEqual(request.model, 'qwen-test');
    assert.deepStrictEqual(request.messages.map((m) => m.role), ['system', 'user']);
    assert.ok(request.format && request.format.properties.findings);
  } finally {
    server.close();
  }
});
