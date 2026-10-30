#!/usr/bin/env node
// Check that the store's pricing structure isn't missing anything, then have local Qwen agents review it.
//   node scripts/pricing-audit.js [--url https://snowseasonstech.store] [--products file.json] [--no-agents]
//                                 [--agent coverage] [--think] [--ollama http://127.0.0.1:11434] [--out .pricing-audit]
//                                 [--json] [--no-write] [--setup]
// Read-only: it GETs /api/products (public prices) and reads the repo; it only writes to the output directory.
// Rule checks are exact and run first. The agents (agents/pricing/*.Modelfile, run through Ollama) add judgment
// on top: gaps in the offering, whether price levels make sense, whether copy matches the price. Agent findings
// that name products the store doesn't have are marked unverified. Exits 1 if a rule check finds an error.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PERIOD_MONTHS = { '1w': 12 / 52, '1m': 1, '3m': 3, '6m': 6, '12m': 12 };
const TIER_WORDS = { basic: 1, starter: 1, standard: 2, pro: 3, advanced: 3, premium: 4, enterprise: 4 };
const SEVERITY_ORDER = { error: 0, warn: 1, info: 2, high: 0, medium: 1, low: 2 };

// ---------------------------------------------------------------------------------------------
// Collecting the facts
// ---------------------------------------------------------------------------------------------

// The DETAILS map in products.html: category, description, icon and features for each product on /products.
function readDetails(html) {
  const m = html.match(/const DETAILS=(\{[\s\S]*?\n\});/);
  return m ? vm.runInNewContext(`(${m[1]})`, {}, { timeout: 1000 }) : {};
}

// The PRODUCTS list in index.html: the homepage service cards. It refers to constants defined above it in the
// same script (API_NOTE, CONTACT_EMAIL), so everything from the script start to the end of the list is evaluated.
function readHomepage(html) {
  const at = html.indexOf('const PRODUCTS=[');
  if (at < 0) return [];
  const start = html.lastIndexOf('<script>', at) + '<script>'.length;
  const end = html.indexOf('\n];', at);
  return vm.runInNewContext(`${html.slice(start, end + 3)}\nPRODUCTS`, {}, { timeout: 1000 });
}

function readSiteUrl(root) {
  try {
    const m = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^SITE_URL=(.+)$/m);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '').replace(/\/$/, '') : null;
  } catch { return null; }
}

async function fetchProducts(url) {
  const r = await fetch(`${url}/api/products`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url}/api/products answered HTTP ${r.status}`);
  return (await r.json()).products;
}

function collect({ root = ROOT, catalog, live, liveError = null }) {
  const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return ''; } };
  return {
    catalog: catalog || require(path.join(root, 'api/_lib/catalog')),
    live,
    liveError,
    details: readDetails(read('products.html')),
    homepage: readHomepage(read('index.html')),
    iconExists: (rel) => fs.existsSync(path.join(root, 'img/icons', rel)),
  };
}

// ---------------------------------------------------------------------------------------------
// Rule checks
// ---------------------------------------------------------------------------------------------
const money = (cents, cur = 'usd') => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(cents / 100);
const billing = (o) => (!o.interval ? 'one-time' : o.intervalCount > 1 ? `every ${o.intervalCount} ${o.interval}s` : { week: 'weekly', month: 'monthly', year: 'yearly' }[o.interval] || o.interval);
const options = (p) => [{ period: '1m', amount: p.amount, interval: p.interval, intervalCount: 1, discount: p.discount }, ...(p.periods || [])];
const tierOf = (id) => {
  const last = id.split('-').pop();
  if (/^\d+$/.test(last)) return Number(last);
  const word = id.split('-').find((t) => TIER_WORDS[t]);
  return word ? TIER_WORDS[word] : null;
};

function rules(f) {
  const out = [];
  const add = (severity, code, products, message) => out.push({ severity, code, products, message });
  const catalog = f.catalog, live = f.live || [];
  const sold = new Map(live.map((p) => [p.id, p]));
  const homepage = new Map(f.homepage.map((p) => [p.id, p]));
  const category = (id) => (f.details[id] && f.details[id].category) || (homepage.get(id) || {}).category || 'Other';

  if (f.liveError) add('error', 'prices-unavailable', [], `Couldn't load live prices, so price checks were skipped: ${f.liveError}`);
  else {
    for (const [id, p] of Object.entries(catalog)) {
      if (p.retired || p.draft) continue;
      if (!p.stripeProduct) add('error', 'no-stripe-product', [id], `${p.name} isn't retired but has no Stripe product, so it can't be sold.`);
      else if (!sold.has(id)) add('error', 'not-on-sale', [id], `${p.name} has no active one-time or monthly price in Stripe, so the site leaves it out and checkout refuses it.`);
    }
  }

  for (const p of live) {
    const c = catalog[p.id] || {};
    const subscription = c.kind === 'subscription';
    if (!p.amount) add('error', 'zero-price', [p.id], `${p.name} has a main price of ${money(p.amount || 0, p.currency)}.`);
    if (subscription && !p.interval) add('warn', 'kind-mismatch', [p.id], `${p.name} is a subscription in the catalog, but its main Stripe price is one-time. Checkout follows the price, so buyers pay once.`);
    if (!subscription && p.interval) add('warn', 'kind-mismatch', [p.id], `${p.name} is one-time in the catalog, but its main Stripe price is ${billing(p)}. Checkout follows the price, so buyers subscribe.`);
    if (!p.interval && (p.periods || []).some((o) => o.interval)) add('warn', 'mixed-billing', [p.id], `${p.name} has a one-time main price plus recurring options. A one-time price fills the monthly slot, so a monthly subscription can't be offered next to it.`);
    if (!f.details[p.id]) add('warn', 'no-details', [p.id], `${p.name} is on sale but has no entry in DETAILS (products.html), so /products shows it under "Other" with no description.`);
    for (const o of p.periods || []) {
      const months = PERIOD_MONTHS[o.period];
      if (months > 1 && p.interval === 'month' && o.amount >= p.amount * months) {
        add('warn', 'no-period-saving', [p.id], `${p.name}: ${billing(o)} costs ${money(o.amount, p.currency)}, no less than ${months} monthly payments (${money(p.amount * months, p.currency)}).`);
      }
    }
    if (!homepage.has(p.id)) add('info', 'not-on-homepage', [p.id], `${p.name} is on sale but has no homepage card (only on /products).`);
  }

  for (const id of Object.keys(f.details)) {
    if (!catalog[id]) add('warn', 'details-unknown', [id], `DETAILS (products.html) has "${id}", which isn't in the catalog. Typo or removed product?`);
  }
  for (const [id, h] of homepage) {
    if (!catalog[id]) add('error', 'homepage-unknown', [id], `The homepage card "${h.name}" uses the id "${id}", which isn't in the catalog, so its Buy button fails.`);
    else if (!f.liveError && !sold.has(id)) add('warn', 'homepage-not-on-sale', [id], `The homepage shows "${h.name}", but it isn't on sale: the card has no price and its Buy button fails.`);
  }

  const icons = [
    ...Object.entries(f.details).map(([id, d]) => [id, d.icon]),
    ...[...homepage].map(([id, h]) => [id, h.icon]),
  ].filter(([, icon]) => icon);
  for (const [id, icon] of icons) if (!f.iconExists(`${icon}.webp`)) add('warn', 'icon-missing', [id], `The icon "${icon}" for ${id} has no file at img/icons/${icon}.webp.`);
  for (const [id, d] of Object.entries(f.details)) {
    for (const [icon] of d.features || []) if (!f.iconExists(`gbp/${icon}.webp`)) add('warn', 'icon-missing', [id], `The feature icon "${icon}" for ${id} has no file at img/icons/gbp/${icon}.webp.`);
  }

  // Families: products in the same category with the same kind of main price (one-time or recurring).
  const families = new Map();
  for (const p of live) {
    const key = `${category(p.id)}|${p.interval ? 'recurring' : 'one-time'}`;
    families.set(key, [...(families.get(key) || []), p]);
  }
  for (const [key, members] of families) {
    if (members.length < 2) continue;
    const [cat] = key.split('|');
    const ranked = members.map((p) => ({ p, tier: tierOf(p.id) })).filter((m) => m.tier != null).sort((a, b) => a.tier - b.tier);
    if (ranked.length === members.length) {
      for (let i = 1; i < ranked.length; i++) {
        const lo = ranked[i - 1], hi = ranked[i];
        if (hi.p.amount <= lo.p.amount) add('warn', 'tier-order', [lo.p.id, hi.p.id], `${cat}: ${hi.p.name} (${money(hi.p.amount, hi.p.currency)}) doesn't cost more than the lower tier ${lo.p.name} (${money(lo.p.amount, lo.p.currency)}).`);
      }
      const numbers = ranked.map((m) => m.tier);
      if (members.every((p) => /-\d+$/.test(p.id))) {
        for (let n = numbers[0]; n < numbers[numbers.length - 1]; n++) {
          if (!numbers.includes(n)) add('warn', 'tier-gap', ranked.map((m) => m.p.id), `${cat}: tiers ${numbers.join(', ')} are on sale, but tier ${n} is missing.`);
        }
      }
    }
    if (members[0].interval) {
      const all = new Set(members.flatMap((p) => options(p).map((o) => o.period)));
      for (const p of members) {
        const have = new Set(options(p).map((o) => o.period)), missing = [...all].filter((x) => !have.has(x));
        if (missing.length) add('warn', 'period-gap', [p.id], `${cat}: ${p.name} has no ${missing.join(', ')} billing option, which other plans in this category offer.`);
      }
    }
  }
  for (const p of live) {
    if (catalog[p.id] && catalog[p.id].kind === 'subscription' && p.interval && !(p.periods || []).length) {
      const fam = families.get(`${category(p.id)}|recurring`) || [];
      if (fam.every((m) => !(m.periods || []).length)) add('info', 'monthly-only', [p.id], `${p.name} is billed monthly only. Longer prepaid options (3, 6 or 12 months) often lift cash up front.`);
    }
  }

  // The same description on products with different prices hides what the extra money buys.
  const byText = new Map();
  for (const p of live) {
    const texts = [];
    if (f.details[p.id] && f.details[p.id].blurb) texts.push(['description on /products', f.details[p.id].blurb]);
    const h = homepage.get(p.id);
    // Homepage cards can share a "Good to know" list on purpose, so a card only counts as a copy when its description matches too.
    if (h) texts.push(['description and feature list on the homepage', [h.blurb, ...(h.features || []), ...(h.coverage || []).map((r) => r.join(': '))].join('|')]);
    for (const [where, text] of texts) byText.set(`${where}\n${text}`, [...(byText.get(`${where}\n${text}`) || []), p]);
  }
  for (const [key, ps] of byText) {
    const prices = new Set(ps.map((p) => p.amount));
    if (ps.length > 1 && prices.size > 1) {
      add('warn', 'same-copy-different-price', ps.map((p) => p.id), `${ps.map((p) => `${p.name} (${money(p.amount, p.currency)})`).join(' and ')} have the same ${key.split('\n')[0]}, so buyers can't see what the higher price adds.`);
    }
  }

  const currencies = new Set(live.map((p) => p.currency));
  if (currencies.size > 1) add('warn', 'currency-mix', live.map((p) => p.id), `Prices are in more than one currency: ${[...currencies].join(', ')}.`);
  const coupon = live.find((p) => p.discount);
  if (coupon) {
    const d = coupon.discount;
    const subs = live.some((p) => p.interval);
    add('info', 'launch-coupon', [], `A ${d.percent}% launch coupon (${d.duration}${d.months ? `, ${d.months} months` : ''}) applies to every product.${subs && d.duration === 'once' ? ' On subscriptions it only discounts the first invoice.' : ''}`);
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ---------------------------------------------------------------------------------------------
// Qwen agents
// ---------------------------------------------------------------------------------------------

// Compact view of the store for the agents: what each product is, what it costs, and how it's described.
function agentFacts(f) {
  const homepage = new Map(f.homepage.map((p) => [p.id, p]));
  const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
  const products = (f.live || []).map((p) => {
    const c = f.catalog[p.id] || {}, d = f.details[p.id] || {}, h = homepage.get(p.id);
    const prices = options(p).sort((a, b) => PERIOD_MONTHS[a.period] - PERIOD_MONTHS[b.period]).map((o) => {
      const months = PERIOD_MONTHS[o.period];
      const saving = p.interval === 'month' && months > 1 ? Math.round(100 - (o.amount * 100) / (p.amount * months)) : null;
      return { billing: billing(o), price: money(o.amount, p.currency), ...(saving != null ? { savingVsMonthly: `${saving}%` } : {}) };
    });
    // The homepage shows features without a featuresTitle under "Good to know" (shared terms, not what the tier includes).
    const included = h ? [...(h.featuresTitle ? h.features || [] : []), ...(h.coverage || []).map((r) => r.join(': '))] : [];
    const terms = h ? [...(h.featuresTitle ? [] : h.features || []), ...(h.notes || [])] : [];
    return {
      id: p.id, name: p.name, category: d.category || (h && h.category) || 'Other',
      catalogKind: c.kind || 'one_time', prices,
      description: clip(d.blurb || (h && h.blurb) || '', 240),
      ...(included.length ? { whatYouGet: included.map((x) => clip(x, 110)).slice(0, 12) } : {}),
      ...(terms.length ? { goodToKnow: terms.map((x) => clip(x, 140)).slice(0, 4) } : {}),
      onHomepage: !!h,
    };
  });
  const coupon = (f.live || []).find((p) => p.discount);
  return {
    products,
    notOnSale: Object.entries(f.catalog).filter(([id, p]) => !p.retired && !(f.live || []).some((x) => x.id === id)).map(([id, p]) => ({ id, name: p.name })),
    launchCoupon: coupon ? coupon.discount : null,
  };
}

function parseModelfile(text) {
  const from = (text.match(/^FROM\s+(\S+)/m) || [])[1];
  const system = (text.match(/^SYSTEM\s+"""([\s\S]*?)"""/m) || [])[1];
  const options = {};
  for (const [, k, v] of text.matchAll(/^PARAMETER\s+(\S+)\s+(\S+)/gm)) options[k] = Number.isFinite(Number(v)) ? Number(v) : v;
  if (!from || !system) throw new Error('Modelfile needs FROM and SYSTEM """..."""');
  return { from, system: system.trim(), options };
}

function loadAgents(root = ROOT) {
  const dir = path.join(root, 'agents/pricing');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.Modelfile')).sort()
    .map((f) => ({ name: f.replace(/\.Modelfile$/, ''), file: path.join(dir, f), ...parseModelfile(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          products: { type: 'array', items: { type: 'string' } },
          issue: { type: 'string' },
          evidence: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'products', 'issue', 'evidence', 'suggestion'],
      },
    },
  },
  required: ['findings'],
};

function agentPrompt(facts, ruleFindings) {
  return [
    'Here is the store\'s pricing data as JSON. Prices come from Stripe; descriptions come from the website.',
    '"whatYouGet" is what a plan includes. "goodToKnow" is terms and exclusions, often shared by several plans on purpose.',
    '```json', JSON.stringify(facts, null, 1), '```',
    'Rule-based checks already reported the issues below and the owner will see them. Leave out any finding about the same products and the same problem, even if you would word it differently:',
    ruleFindings.length ? ruleFindings.map((r) => `- [${r.code}] (${r.products.join(', ')}) ${r.message}`).join('\n') : '- (none)',
    'Use only product ids from the data. Return at most 8 findings, most important first. Return an empty list if you find nothing new.',
  ].join('\n');
}

// What each rule check is about, so an agent finding that restates one can be dropped.
const RULE_TOPICS = {
  'period-gap': /\b(billing|month|year|week|period|prepay|annual|option)/i,
  'monthly-only': /\b(billing|month|year|week|period|prepay|annual|option)/i,
  'no-period-saving': /\b(saving|discount|month|prepay|period)/i,
  'same-copy-different-price': /\b(identical|same|indistinguishable|description|feature list|copy)/i,
  'tier-order': /\btier/i,
  'tier-gap': /\btier/i,
  'not-on-sale': /not on sale|no (active )?price|stripe product|can.t be (bought|sold)/i,
  'no-stripe-product': /not on sale|no (active )?price|stripe product|can.t be (bought|sold)/i,
  'kind-mismatch': /one-time|subscription|recurring/i,
};
function repeatsRule(finding, ruleFindings) {
  if (!finding.products.length) return false;
  const text = `${finding.issue} ${finding.evidence}`;
  return finding.products.every((id) => ruleFindings.some((r) => r.products.includes(id) && RULE_TOPICS[r.code] && RULE_TOPICS[r.code].test(text)));
}

// Keeps well-formed findings and marks any that name products the store doesn't have.
function checkFindings(raw, knownIds) {
  const list = raw && Array.isArray(raw.findings) ? raw.findings : [];
  return list.filter((x) => x && typeof x.issue === 'string' && x.issue.trim()).slice(0, 8).map((x) => {
    const products = Array.isArray(x.products) ? x.products.map(String) : [];
    const unknown = products.filter((id) => !knownIds.has(id));
    return {
      severity: ['high', 'medium', 'low'].includes(x.severity) ? x.severity : 'low',
      products: products.filter((id) => knownIds.has(id)),
      issue: x.issue.trim(), evidence: String(x.evidence || '').trim(), suggestion: String(x.suggestion || '').trim(),
      ...(unknown.length ? { unverified: `names products the store doesn't have: ${unknown.join(', ')}` } : {}),
    };
  });
}

// Streams the reply: Node's fetch gives up if response headers take over 5 minutes, and a CPU-bound model
// answering in one piece can take longer than that. Streaming sends headers at once, then a line per chunk.
async function runAgent(agent, prompt, { ollama, think }) {
  const started = Date.now();
  const r = await fetch(`${ollama}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30 * 60 * 1000),
    body: JSON.stringify({
      model: agent.from, stream: true, think, keep_alive: '10m', format: FINDINGS_SCHEMA,
      options: agent.options,
      messages: [{ role: 'system', content: agent.system }, { role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`Ollama answered HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  let content = '', buffered = '';
  const decoder = new TextDecoder();
  const take = (line) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line);
    if (chunk.error) throw new Error(`Ollama: ${chunk.error}`);
    if (chunk.message && chunk.message.content) content += chunk.message.content;
  };
  for await (const part of r.body) {
    buffered += decoder.decode(part, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop();
    lines.forEach(take);
  }
  take(buffered);
  return { raw: JSON.parse(content), seconds: Math.round((Date.now() - started) / 1000) };
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------
const ICON = { error: '🔴', warn: '🟠', info: '🔵', high: '🔴', medium: '🟠', low: '🔵' };

function renderMarkdown(report) {
  const lines = [`# Pricing audit`, '', `${report.store} · ${report.products} products on sale · ${report.at}`, ''];
  const errors = report.rules.filter((r) => r.severity === 'error').length, warns = report.rules.filter((r) => r.severity === 'warn').length;
  lines.push(`## Rule checks (${errors} errors, ${warns} warnings)`, '');
  if (!report.rules.length) lines.push('Nothing missing.', '');
  for (const r of report.rules) lines.push(`- ${ICON[r.severity]} **${r.code}**${r.products.length ? ` (${r.products.join(', ')})` : ''}: ${r.message}`);
  lines.push('');
  for (const a of report.agents) {
    lines.push(`## Agent: ${a.name}${a.seconds != null ? ` (${a.model}, ${a.seconds}s)` : ''}`, '');
    if (a.error) { lines.push(`Skipped: ${a.error}`, ''); continue; }
    if (!a.findings.length) lines.push('No new findings.');
    if (a.repeatsDropped) lines.push(`_${a.repeatsDropped} finding${a.repeatsDropped === 1 ? '' : 's'} that repeated a rule check left out._`, '');
    for (const x of a.findings) {
      lines.push(`- ${ICON[x.severity]} **${x.issue}**${x.products.length ? ` (${x.products.join(', ')})` : ''}`);
      if (x.evidence) lines.push(`  - Evidence: ${x.evidence}`);
      if (x.suggestion) lines.push(`  - Suggestion: ${x.suggestion}`);
      if (x.unverified) lines.push(`  - ⚠️ Unverified: ${x.unverified}`);
    }
    lines.push('');
  }
  if (report.agents.length) lines.push('_Agent findings are suggestions from a local model. Check them against Stripe and the site before acting._', '');
  return lines.join('\n');
}

function parseArgs(argv) {
  const a = { agents: true, think: false, write: true, json: false, only: null, setup: false, out: '.pricing-audit', ollama: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--no-agents') a.agents = false;
    else if (k === '--think') a.think = true;
    else if (k === '--no-write') a.write = false;
    else if (k === '--json') a.json = true;
    else if (k === '--setup') a.setup = true;
    else if (['--url', '--products', '--agent', '--ollama', '--out'].includes(k)) a[k.slice(2) === 'agent' ? 'only' : k.slice(2)] = argv[++i];
    else throw new Error(`Unknown option ${k}`);
  }
  if (a.ollama && !/^https?:\/\//.test(a.ollama)) a.ollama = `http://${a.ollama}`;
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.setup) {
    // Optional: registers each agent with Ollama (snow-pricing-<name>) so you can also chat with it: ollama run snow-pricing-coverage
    for (const agent of loadAgents()) {
      execFileSync('ollama', ['create', `snow-pricing-${agent.name}`, '-f', agent.file], { stdio: 'inherit' });
    }
    return;
  }
  const store = (args.url || readSiteUrl(ROOT) || 'https://snowseasonstech.store').replace(/\/$/, '');
  let live = null, liveError = null;
  try { live = args.products ? JSON.parse(fs.readFileSync(args.products, 'utf8')).products : await fetchProducts(store); }
  catch (e) { liveError = e.message; }
  const facts = collect({ live: live || [], liveError });
  const ruleFindings = rules(facts);
  const report = { store: args.products || store, at: new Date().toISOString(), products: (live || []).length, rules: ruleFindings, agents: [] };

  if (args.agents && live) {
    const agents = loadAgents().filter((a) => !args.only || a.name === args.only);
    if (args.only && !agents.length) throw new Error(`No agent named ${args.only} in agents/pricing/`);
    const prompt = agentPrompt(agentFacts(facts), ruleFindings);
    const known = new Set(live.map((p) => p.id).concat(Object.keys(facts.catalog)));
    for (const agent of agents) {
      process.stderr.write(`agent ${agent.name} (${agent.from})… `);
      try {
        const { raw, seconds } = await runAgent(agent, prompt, args);
        const all = checkFindings(raw, known), findings = all.filter((x) => !repeatsRule(x, ruleFindings));
        report.agents.push({ name: agent.name, model: agent.from, seconds, findings, repeatsDropped: all.length - findings.length });
        process.stderr.write(`${seconds}s\n`);
      } catch (e) {
        const code = e.cause && e.cause.code;
        const msg = code === 'ECONNREFUSED' ? `Ollama isn't reachable at ${args.ollama}` : `${e.message}${code ? ` (${code})` : ''}`;
        report.agents.push({ name: agent.name, model: agent.from, error: msg });
        process.stderr.write(`failed: ${msg}\n`);
      }
    }
  }

  const md = renderMarkdown(report);
  if (args.write) {
    const out = path.resolve(ROOT, args.out);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'latest.md'), md);
    fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(report, null, 2));
  }
  process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : md);
  if (ruleFindings.some((r) => r.severity === 'error')) process.exitCode = 1;
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(2); });
module.exports = { readDetails, readHomepage, collect, rules, agentFacts, parseModelfile, loadAgents, checkFindings, repeatsRule, runAgent, agentPrompt, renderMarkdown, parseArgs, tierOf };
