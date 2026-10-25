const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { scan, renderMarkdown, matches, mentions, imports } = require('../scripts/bloat-scan');

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

// A throwaway git repo with the given files committed; `force` lists paths to add even if ignored.
function makeRepo(files, { force = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloat-test-'));
  sh(dir, 'init', '-q');
  sh(dir, 'config', 'user.email', 't@example.com');
  sh(dir, 'config', 'user.name', 'Test');
  addFiles(dir, files);
  sh(dir, 'add', '-A');
  if (force.length) sh(dir, 'add', '-f', ...force);
  sh(dir, 'commit', '-q', '-m', 'init');
  return dir;
}
function addFiles(dir, files) {
  for (const [p, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), content);
  }
}
const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });
const bytes = (n, fill = 1) => Buffer.alloc(n, fill);

test('matches handles basenames, directory prefixes and exact paths', () => {
  assert.ok(matches('a/b/pnpm-lock.yaml', 'pnpm-lock.yaml'));
  assert.ok(matches('products/x/y.js', 'products/'));
  assert.ok(!matches('myproducts/x.js', 'products/'));
  assert.ok(matches('a/b.js', 'a/b.js'));
  assert.ok(!matches('a/b.js', 'a/c.js'));
});

test('mentions does not treat part of a longer name as a reference', () => {
  assert.ok(mentions(`require('stripe')`, 'stripe'));
  assert.ok(mentions('"scripts": {"test": "jest --coverage"}', 'jest'));
  assert.ok(!mentions(`import x from '@stripe/ui-extension-sdk'`, 'stripe'));
  assert.ok(!mentions('stripe-app.json', 'stripe'));
  assert.ok(mentions(`from '@stripe/ui-extension-sdk/ui'`, '@stripe/ui-extension-sdk'));
});

test('imports matches quoted module paths and manifest names, not prose', () => {
  assert.ok(imports(`require('./store')`, 'store'));
  assert.ok(imports(`import x from '../lib/projection.js'`, 'projection'));
  assert.ok(imports(`"component": "HomeProjection"`, 'HomeProjection'));
  assert.ok(!imports('the store falls back to memory', 'store'));
  assert.ok(!imports(`require('./restore')`, 'store'));
});

test('large files use a lower bar for images and ignored names are skipped', () => {
  const dir = makeRepo({
    'big.png': bytes(160000), 'small.png': bytes(100000), 'data.json': bytes(160000), 'big.txt': bytes(250000),
    'pnpm-lock.yaml': bytes(900000),
  });
  try {
    const r = scan({ root: dir, config: { largeImageBytes: 150000, largeFileBytes: 200000, ignore: ['pnpm-lock.yaml'] } });
    assert.deepStrictEqual(r.large.map((l) => l.path), ['big.txt', 'big.png']);
    assert.strictEqual(r.large.find((l) => l.path === 'big.png').kind, 'image');
    assert.ok(!r.large.some((l) => l.path === 'pnpm-lock.yaml'));
    assert.strictEqual(r.totals.trackedFiles, 4);
  } finally { cleanup(dir); }
});

test('committed junk is found and an ignore gap is reported only when no rule covers it', () => {
  const dir = makeRepo({ 'lib/__pycache__/a.cpython-314.pyc': bytes(10), 'notes.log': 'x', 'ok.js': '1' });
  try {
    const r = scan({ root: dir });
    assert.deepStrictEqual(r.junk.map((j) => j.path).sort(), ['lib/__pycache__/a.cpython-314.pyc', 'notes.log']);
    assert.ok(r.junk.every((j) => j.ignored === false));
    assert.deepStrictEqual(r.ignoreGaps.map((g) => g.line).sort(), ['*.log', '__pycache__/']);
  } finally { cleanup(dir); }

  const covered = makeRepo({ '.gitignore': '__pycache__/\n', 'lib/__pycache__/a.pyc': bytes(10) }, { force: ['lib/__pycache__/a.pyc'] });
  try {
    const r = scan({ root: covered });
    assert.strictEqual(r.junk.length, 1);
    assert.strictEqual(r.junk[0].ignored, true);
    assert.deepStrictEqual(r.ignoreGaps, []);
  } finally { cleanup(covered); }
});

test('duplicates group identical content only, and skip tiny files', () => {
  const dir = makeRepo({
    'a/one.bin': bytes(2000, 7), 'b/two.bin': bytes(2000, 7), 'c/three.bin': bytes(2000, 7),
    'd/same-size-different.bin': bytes(2000, 9),
    'tiny1.txt': 'same', 'tiny2.txt': 'same',
  });
  try {
    const r = scan({ root: dir, config: { duplicateMinBytes: 1024 } });
    assert.strictEqual(r.duplicates.length, 1);
    assert.strictEqual(r.duplicates[0].count, 3);
    assert.strictEqual(r.duplicates[0].wastedBytes, 4000);
    assert.deepStrictEqual(r.duplicates[0].paths.sort(), ['a/one.bin', 'b/two.bin', 'c/three.bin']);
  } finally { cleanup(dir); }
});

test('unused dependencies: scripts, imports and scoped names count as references; @types are skipped', () => {
  const dir = makeRepo({
    'package.json': JSON.stringify({
      scripts: { lint: 'eslint src' },
      dependencies: { 'used-pkg': '1', 'unused-pkg': '1', '@scope/used': '1' },
      devDependencies: { eslint: '1', 'unused-dev': '1', '@types/node': '1' },
    }),
    'src/index.js': `const a = require('used-pkg'); import b from '@scope/used/sub';`,
    // The lockfile and the dependency lists themselves must not count as references.
    'package-lock.json': JSON.stringify({ packages: { 'node_modules/unused-pkg': {} } }),
  });
  try {
    const r = scan({ root: dir });
    assert.deepStrictEqual(r.dependencies.map((d) => d.name).sort(), ['unused-dev', 'unused-pkg']);
    assert.strictEqual(r.dependencies.find((d) => d.name === 'unused-pkg').confidence, 'medium');
    assert.strictEqual(r.dependencies.find((d) => d.name === 'unused-dev').confidence, 'low');
    assert.strictEqual(r.skippedTypes, 1);
  } finally { cleanup(dir); }
});

test('a package only searches its own directory, so a nested package is not satisfied by the parent', () => {
  const dir = makeRepo({
    'package.json': JSON.stringify({ dependencies: { shared: '1' } }),
    'index.js': `require('shared')`,
    'app/package.json': JSON.stringify({ dependencies: { shared: '1' } }),
    'app/main.js': `console.log('no imports')`,
  });
  try {
    const r = scan({ root: dir });
    assert.deepStrictEqual(r.dependencies.map((d) => `${d.package}:${d.name}`), ['app/package.json:shared']);
  } finally { cleanup(dir); }
});

test('unreferenced assets and modules are listed; referenced and ignored ones are not', () => {
  const dir = makeRepo({
    'index.html': '<img src="assets/used.png">',
    'assets/used.png': bytes(10), 'assets/orphan.png': bytes(500),
    // a.js is required relatively, sub/index.js through its directory; b.js and c.js are never imported.
    'lib/b.js': `require('./a'); require('./sub'); // the word c appears in prose here`,
    'lib/a.js': '1', 'lib/c.js': '1', 'lib/sub/index.js': '1', 'lib/a.test.js': 'test',
    'products/shipped.png': bytes(10),
  });
  try {
    const r = scan({ root: dir, config: { orphanIgnore: ['products/'], orphanSourceDirs: ['lib/'] } });
    assert.deepStrictEqual(r.orphans.map((o) => o.path).sort(), ['assets/orphan.png', 'lib/b.js', 'lib/c.js']);
    assert.strictEqual(r.orphans.find((o) => o.path === 'assets/orphan.png').kind, 'asset');
    assert.strictEqual(r.orphans.find((o) => o.path === 'lib/c.js').kind, 'module');
  } finally { cleanup(dir); }
});

test('growth compares with the previous run and lists large files added since', () => {
  const dir = makeRepo({ 'a.txt': bytes(1000) });
  try {
    const head1 = sh(dir, 'rev-parse', 'HEAD').trim();
    const first = scan({ root: dir });
    assert.strictEqual(first.growth.previous, null);

    addFiles(dir, { 'new-big.png': bytes(200000) });
    sh(dir, 'add', '-A'); sh(dir, 'commit', '-q', '-m', 'add');
    const r = scan({ root: dir, config: { growthAlertPercent: 10 }, previous: { at: '2026-01-01T00:00:00Z', head: head1, trackedBytes: first.totals.trackedBytes } });
    assert.strictEqual(r.growth.deltaBytes, 200000);
    assert.ok(r.growth.alert);
    assert.deepStrictEqual(r.growth.addedLarge.map((a) => a.path), ['new-big.png']);

    const unreachable = scan({ root: dir, previous: { at: '2026-01-01T00:00:00Z', head: 'f'.repeat(40), trackedBytes: 1 } });
    assert.match(unreachable.growth.note, /no longer reachable/);
  } finally { cleanup(dir); }
});

test('scanning is read-only: the repo is unchanged afterwards', () => {
  const dir = makeRepo({ 'a.txt': bytes(3000), 'b.txt': bytes(3000), 'x.pyc': bytes(5) });
  try {
    const before = { status: sh(dir, 'status', '--porcelain'), files: fs.readdirSync(dir).sort() };
    const r = scan({ root: dir });
    renderMarkdown(r);
    assert.deepStrictEqual({ status: sh(dir, 'status', '--porcelain'), files: fs.readdirSync(dir).sort() }, before);
  } finally { cleanup(dir); }
});

test('the markdown report has the main sections and flags the growth alert', () => {
  const dir = makeRepo({ 'big.png': bytes(300000), 'x.pyc': bytes(5), 'a.bin': bytes(2000), 'b.bin': bytes(2000) });
  try {
    const r = scan({ root: dir, previous: { at: '2026-01-01T00:00:00Z', head: null, trackedBytes: 100000 } });
    const md = renderMarkdown(r);
    for (const heading of ['# Repo bloat report', '## Totals', '## Large files and images', '## Committed junk', '## Duplicate files', '## Reading this report']) {
      assert.ok(md.includes(heading), heading);
    }
    assert.match(md, /over the growth alert threshold/);
    assert.match(md, /Missing \.gitignore rules/);
  } finally { cleanup(dir); }
});
