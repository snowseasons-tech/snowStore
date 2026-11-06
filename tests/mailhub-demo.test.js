const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'products/mailhub/demo/adapter.js'), 'utf8');
function demo() {
  const context = vm.createContext({URL, FormData, structuredClone, Date});
  vm.runInContext(source, context);
  return vm.runInContext('mailhubDemo', context);
}
const post = (app, url, body = {}) => app.request(url, {method: 'POST', body: JSON.stringify(body)});
function csvForm(csv, consent = true) {
  const form = new FormData();
  form.append('file', new Blob([csv], {type: 'text/csv'}), 'sample.csv');
  form.append('consent', String(consent));
  return form;
}

test('MailHub demo is generated from its actual interface and isolated from live services', () => {
  const generated = spawnSync('python3', ['-I', '-c', "import runpy; print(runpy.run_path('scripts/build-mailhub-demo.py')['build'](), end='')"], {cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024});
  assert.equal(generated.status, 0, generated.stderr);
  const page = fs.readFileSync(path.join(root, 'products/mailhub/demo.html'), 'utf8');
  assert.ok(page === generated.stdout, 'Rebuild the MailHub demo after changing its UI or adapter');
  for (const screen of ['campaigns', 'contacts', 'segments', 'suppressed', 'settings']) assert.ok(page.includes(`data-tab="${screen}"`));
  assert.doesNotMatch(page, /fetch\(|localStorage|sessionStorage|<script\s+src=/);
  assert.doesNotMatch(page, /\/demos\/(social-studio|operations-lead-intelligence|inspections-intelligence|roadside-delay-planner)/);
  assert.match(page, /<input disabled hidden id="sKey"/);
  assert.match(page, /<input disabled hidden id="sSecret"/);
});

test('list and tag segments intersect and always exclude suppressed contacts', async () => {
  const app = demo();
  assert.deepEqual(await app.request('/campaigns/c1/audience'), {recipients: 4});
  const body = {name: 'VIP sample', subject: 'Hi', body_html: '<p>Sample</p>', list_id: 'l2', segment_id: 's1'};
  const campaign = await post(app, '/campaigns', body);
  assert.deepEqual(await app.request(`/campaigns/${campaign.id}/audience`), {recipients: 1});
  const any = await post(app, '/segments', {name: 'Any reader', tags: ['newsletter', 'VIP'], match: 'any'});
  const other = await post(app, '/campaigns', {...body, list_id: null, segment_id: any.id});
  assert.deepEqual(await app.request(`/campaigns/${other.id}/audience`), {recipients: 5});
});

test('CSV import requires consent and handles quoted fields, duplicates and suppressions', async () => {
  const app = demo();
  const csv = '\uFEFFemail,first_name,last_name,tags\r\nnew@example.com,"Casey, Jr.",Demo,newsletter|vip\r\ntaylor@example.com,Taylor,Demo,newsletter\r\ninvalid-address,Wrong,Demo,vip\r\nnew@example.com,"Casey, Jr.",Example,vip\r\n';
  await assert.rejects(app.request('/lists/l1/import', {method: 'POST', body: csvForm(csv, false)}), /agreed/);
  assert.equal((await app.request('/contacts')).total, 6);
  const result = await app.request('/lists/l1/import', {method: 'POST', body: csvForm(csv)});
  assert.deepEqual(result, {added: 1, updated: 1, invalid: 1, suppressed: 1});
  const added = (await app.request('/contacts?q=new%40example.com')).contacts[0];
  assert.equal(added.first_name, 'Casey, Jr.');
  assert.deepEqual(added.tags, ['vip']);
  assert.equal((await app.request('/contacts?q=taylor')).contacts[0].suppressed, true);
});

test('the downloadable sample CSV imports through the same demo flow', async () => {
  const page = fs.readFileSync(path.join(root, 'products/mailhub/demo.html'), 'utf8');
  const download = page.match(/function downloadDemoCsv\(\)\{[\s\S]*?\n\}/)[0];
  let file, clicked = false;
  const anchor = {click() { clicked = true; }};
  const context = vm.createContext({
    Blob, setTimeout: () => {}, document: {createElement: () => anchor},
    URL: {createObjectURL(blob) {file = blob; return 'blob:sample';}, revokeObjectURL() {}},
  });
  vm.runInContext(download + '\ndownloadDemoCsv();', context);
  assert.ok(clicked);
  assert.equal(anchor.download, 'mailhub-sample-contacts.csv');
  const result = await demo().request('/lists/l1/import', {method: 'POST', body: csvForm(await file.text())});
  assert.deepEqual(result, {added: 1, updated: 1, invalid: 0, suppressed: 1});
});

test('deleting and reimporting a contact cannot remove a suppression', async () => {
  const app = demo();
  await app.request('/contacts/p4', {method: 'DELETE'});
  await app.request('/lists/l1/import', {method: 'POST', body: csvForm('email,first_name,tags\ntaylor@example.com,Taylor,newsletter')});
  assert.equal((await app.request('/contacts?q=taylor')).contacts[0].suppressed, true);
  assert.deepEqual(await app.request('/campaigns/c1/audience'), {recipients: 4});
});

test('simulated worker rechecks suppressions after queueing and records no invented engagement', async () => {
  const app = demo();
  await post(app, '/campaigns/c1/send');
  await post(app, '/suppressions', {email: 'alex@example.com'});
  assert.equal(app.runWorker(), 1);
  const stats = await app.request('/campaigns/c1/stats');
  assert.equal(stats.sent, 3);
  assert.equal(stats.skipped, 1);
  assert.equal(stats.opened, 0);
  assert.equal(stats.delivered, 0);
  assert.equal((await app.request('/plan')).used, 123);
});

test('scheduled campaigns wait and can be canceled without changing the send count', async () => {
  const app = demo();
  await assert.rejects(post(app, '/campaigns/c1/send', {send_at: '2020-01-01T10:00:00Z'}), /future/);
  await post(app, '/campaigns/c1/send', {send_at: new Date(Date.now() + 86400000).toISOString()});
  assert.equal(app.runWorker(), 0);
  await post(app, '/campaigns/c1/cancel');
  assert.equal((await app.request('/campaigns/c1/stats')).canceled, 4);
  assert.equal((await app.request('/plan')).used, 120);
});

test('sample settings gate sending and reject actual credential inputs', async () => {
  const app = demo();
  await app.request('/settings', {method: 'PUT', body: JSON.stringify({postal_address: ''})});
  await assert.rejects(post(app, '/campaigns/c1/send'), /postal address/);
  await assert.rejects(app.request('/settings', {method: 'PUT', body: JSON.stringify({resend_api_key: 'placeholder-do-not-store'})}), /not accepted/);
  await post(app, '/domain', {domain: 'mail.example.com'});
  assert.equal((await app.request('/settings')).domain_status, 'pending');
  await post(app, '/domain/check');
  assert.equal((await app.request('/settings')).domain_status, 'verified');
});

test('paused campaigns resume, non-drafts cannot be edited, and reset restores sample state', async () => {
  const app = demo();
  await post(app, '/campaigns/c3/resume');
  assert.equal(app.runWorker(), 1);
  await assert.rejects(app.request('/campaigns/c2', {method: 'PUT', body: '{}'}), /Only drafts/);
  await post(app, '/lists', {name: 'Temporary list'});
  app.reset();
  assert.equal((await app.request('/lists')).length, 2);
  assert.equal((await app.request('/campaigns')).find(c => c.id === 'c3').status, 'paused');
  assert.equal((await app.request('/plan')).used, 120);
  await assert.rejects(app.request('/auth/login', {method: 'POST'}), /not available/);
});
