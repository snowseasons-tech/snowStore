const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../Blogen/ollama.mjs');
const topic = { name: 'Weekly' };
const items = [{ title: 'A', site: 'a.example', summary: ['One fact.'] }];
const ok = (response) => async () => ({ ok: true, json: async () => ({ response }) });
const long = 'This is a useful opening paragraph about the week, long enough to count as a real draft.';

test('a good answer becomes the draft, cleaned of thinking', async () => {
  const { generateDraft } = await load();
  assert.strictEqual(await generateDraft(topic, items, { fetchImpl: ok(`<think>plan</think>${long}`) }), long);
});

test('drafts ask for a low temperature', async () => {
  const { generateDraft } = await load();
  let sent;
  await generateDraft(topic, items, { fetchImpl: async (u, o) => { sent = JSON.parse(o.body); return ok(long)(); } });
  assert.strictEqual(sent.options.temperature, 0.1);
});

test('unsupported causes are removed, sourced ones stay', async () => {
  const { dropUnsupported } = await load();
  const draft = 'Demand rose. This suggests people like cool weather.\n\nPrices fell due to oil.';
  assert.strictEqual(dropUnsupported(draft, items), 'Demand rose.');
  assert.match(dropUnsupported(draft, [{ summary: ['Prices fell due to oil.'] }]), /due to oil/);
});

test('model output loses HTML, links, images and template tags', async () => {
  const { cleanDraft } = await load();
  const out = cleanDraft('Hi <script>alert(1)</script> [site](https://evil.example) ![x](https://evil.example/a.png) https://evil.example {{sources}}');
  assert.doesNotMatch(out, /script>|evil|\]\(|\{\{/);
  assert.match(out, /site/);
});

test('scraped text sits inside the data markers', async () => {
  const { draftPrompt } = await load();
  const p = draftPrompt(topic, items);
  assert.ok(p.indexOf('<<<SOURCES') < p.indexOf('One fact.') && p.indexOf('One fact.') < p.indexOf('SOURCES>>>'));
});

test('every failure returns null so the normal post is kept', async () => {
  const { generateDraft } = await load();
  const logs = [];
  const log = (m) => logs.push(m);
  assert.strictEqual(await generateDraft(topic, items, { log, fetchImpl: async () => { throw new Error('refused'); } }), null);
  assert.strictEqual(await generateDraft(topic, items, { log, fetchImpl: async () => ({ ok: false, status: 404 }) }), null);
  assert.strictEqual(await generateDraft(topic, items, { log, fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }) }), null);
  assert.strictEqual(await generateDraft(topic, items, { log, fetchImpl: ok('too short') }), null);
  assert.strictEqual(logs.length, 4);
});
