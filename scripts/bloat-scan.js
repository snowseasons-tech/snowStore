#!/usr/bin/env node
// Scan this repo for bloat and write a report. Read-only: it only writes to the output directory.
//   node scripts/bloat-scan.js [--root .] [--out .bloat] [--config bloat.config.json] [--json] [--no-write]
// Looks at tracked files only: large files and images, committed junk, exact duplicates, unused
// dependencies, unreferenced assets and modules, and growth since the previous run.
// Everything it reports is a candidate. References are found by name, so dynamically built paths and
// tools wired up by presets can look unused. Triage before deleting anything.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DEFAULTS = {
  largeFileBytes: 200000,
  largeImageBytes: 150000,
  duplicateMinBytes: 1024,
  growthAlertPercent: 10,
  // Never reported by any check: matched by basename (no "/"), directory prefix (ends in "/") or exact path.
  ignore: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'],
  // Path prefixes where nothing is expected to be referenced by name (deliverables, routes, entry points).
  orphanIgnore: [],
  // Directories whose source modules must be imported by something.
  orphanSourceDirs: [],
  junk: [
    { name: 'Python bytecode', pattern: '(^|/)__pycache__/|\\.pyc$', ignoreLine: '__pycache__/' },
    { name: 'Dependencies', pattern: '(^|/)node_modules/', ignoreLine: 'node_modules/' },
    { name: 'Build output', pattern: '(^|/)(dist|build|coverage|\\.next|\\.wrangler)/', ignoreLine: 'dist/' },
    { name: 'Logs and temp files', pattern: '\\.(log|tmp|swp|swo)$|~$', ignoreLine: '*.log' },
    { name: 'OS metadata', pattern: '(^|/)(\\.DS_Store|Thumbs\\.db)$', ignoreLine: '.DS_Store' },
    { name: 'Source maps', pattern: '\\.map$', ignoreLine: '*.map' },
  ],
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?|ico|heic)$/i;
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|wav)$/i;
const TEXT_EXT = /\.(html?|css|m?[jt]sx?|cjs|json|md|txt|ya?ml|toml|sh|py|svg|xml)$/i;
const SOURCE_EXT = /\.(m?[jt]sx?|cjs|css)$/i;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const DEP_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

const git = (root, args, opts = {}) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...opts });

function matches(p, pattern) {
  if (pattern.endsWith('/')) return p.startsWith(pattern);
  if (!pattern.includes('/')) return path.posix.basename(p) === pattern;
  return p === pattern;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A name counts as mentioned when it is not part of a longer name, so "stripe" does not match "@stripe/x".
const mentions = (text, name) => new RegExp(`(?<![\\w@/.-])${escapeRe(name)}(?![\\w-])`).test(text);
// A module counts as imported when its name ends a quoted path: './a', '../lib/a.js', "HomeProjection".
// Prose that happens to contain the word does not count, and a directory's index file is found by the directory name.
const imports = (text, stem) => new RegExp(`['"\`/]${escapeRe(stem)}(\\.[A-Za-z]+)?['"\`]`).test(text);

function ignoredPaths(root, paths) {
  if (!paths.length) return new Set();
  try {
    const out = git(root, ['check-ignore', '--no-index', '-z', '--stdin'], { input: paths.join('\0') });
    return new Set(out.split('\0').filter(Boolean));
  } catch (e) {
    if (e.status === 1) return new Set();
    throw e;
  }
}

function packageBins(root, dir, name) {
  for (const base of [path.join(root, dir), root]) {
    try {
      const { bin } = JSON.parse(fs.readFileSync(path.join(base, 'node_modules', name, 'package.json'), 'utf8'));
      if (typeof bin === 'string') return [name.split('/').pop()];
      if (bin && typeof bin === 'object') return Object.keys(bin);
    } catch { /* not installed here */ }
  }
  return [];
}

function scan({ root, config = {}, previous = null, now = new Date() }) {
  const cfg = { ...DEFAULTS, ...config };
  const isIgnored = (p) => cfg.ignore.some((pat) => matches(p, pat));

  const files = [];
  for (const p of git(root, ['ls-files', '-z']).split('\0').filter(Boolean)) {
    if (isIgnored(p)) continue;
    let st;
    try { st = fs.lstatSync(path.join(root, p)); } catch { continue; } // deleted in the working tree
    if (st.isFile()) files.push({ path: p, bytes: st.size });
  }
  const sum = (list) => list.reduce((n, f) => n + f.bytes, 0);

  // Totals and where the bytes are.
  const dirs = new Map();
  for (const f of files) {
    const d = f.path.includes('/') ? f.path.split('/')[0] : '(root files)';
    const cur = dirs.get(d) || { dir: d, bytes: 0, files: 0 };
    cur.bytes += f.bytes; cur.files++;
    dirs.set(d, cur);
  }
  const counts = git(root, ['count-objects', '-v']);
  const kib = (key) => Number((counts.match(new RegExp(`^${key}: (\\d+)`, 'm')) || [])[1] || 0);
  const totals = {
    trackedFiles: files.length,
    trackedBytes: sum(files),
    imageBytes: sum(files.filter((f) => IMAGE_EXT.test(f.path))),
    gitKiB: kib('size') + kib('size-pack'),
    byDir: [...dirs.values()].sort((a, b) => b.bytes - a.bytes),
  };

  // Large files; images have a lower bar because they are the usual culprit.
  const large = files
    .filter((f) => f.bytes >= (IMAGE_EXT.test(f.path) ? cfg.largeImageBytes : cfg.largeFileBytes))
    .map((f) => ({ ...f, kind: IMAGE_EXT.test(f.path) ? 'image' : 'file' }))
    .sort((a, b) => b.bytes - a.bytes);

  // Committed junk, and whether an ignore rule already exists for it.
  const rules = cfg.junk.map((r) => ({ ...r, re: new RegExp(r.pattern) }));
  const junk = [];
  for (const f of files) {
    const rule = rules.find((r) => r.re.test(f.path));
    if (rule) junk.push({ path: f.path, bytes: f.bytes, rule: rule.name, ignoreLine: rule.ignoreLine });
  }
  const covered = ignoredPaths(root, junk.map((j) => j.path));
  for (const j of junk) j.ignored = covered.has(j.path);
  const ignoreGaps = [...new Map(junk.filter((j) => !j.ignored).map((j) => [j.ignoreLine, { rule: j.rule, line: j.ignoreLine }])).values()];

  // Exact duplicates: same size first, then same content.
  const bySize = new Map();
  for (const f of files) if (f.bytes >= cfg.duplicateMinBytes) bySize.set(f.bytes, [...(bySize.get(f.bytes) || []), f]);
  const duplicates = [];
  for (const group of bySize.values()) {
    if (group.length < 2) continue;
    const byHash = new Map();
    for (const f of group) {
      const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f.path))).digest('hex');
      byHash.set(h, [...(byHash.get(h) || []), f.path]);
    }
    for (const paths of byHash.values()) {
      if (paths.length > 1) duplicates.push({ bytes: group[0].bytes, count: paths.length, wastedBytes: group[0].bytes * (paths.length - 1), paths });
    }
  }
  duplicates.sort((a, b) => b.wastedBytes - a.wastedBytes);

  // Text of every readable file, used to look for references by name.
  const packageFiles = files.filter((f) => path.posix.basename(f.path) === 'package.json');
  const packageDirs = packageFiles.map((f) => path.posix.dirname(f.path)).map((d) => (d === '.' ? '' : d));
  const texts = new Map();
  for (const f of files) {
    if (!TEXT_EXT.test(f.path) || f.bytes > MAX_TEXT_BYTES) continue;
    let text = fs.readFileSync(path.join(root, f.path), 'utf8');
    if (path.posix.basename(f.path) === 'package.json') {
      // Dependency lists would make every package look referenced; keep scripts, main, bin and the rest.
      try {
        const pkg = JSON.parse(text);
        for (const s of DEP_SECTIONS) delete pkg[s];
        text = JSON.stringify(pkg);
      } catch { /* leave the raw text */ }
    }
    texts.set(f.path, text);
  }
  const owner = (p) => packageDirs.filter((d) => d === '' || p.startsWith(`${d}/`)).sort((a, b) => b.length - a.length)[0];

  // Declared dependencies that nothing in their package mentions.
  const dependencies = [];
  let skippedTypes = 0;
  for (const f of packageFiles) {
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(path.join(root, f.path), 'utf8')); } catch { continue; }
    const dir = path.posix.dirname(f.path) === '.' ? '' : path.posix.dirname(f.path);
    const scope = [...texts].filter(([p]) => owner(p) === dir).map(([, t]) => t);
    for (const kind of ['dependencies', 'devDependencies']) {
      for (const name of Object.keys(pkg[kind] || {})) {
        if (name.startsWith('@types/')) { skippedTypes++; continue; }
        const names = [name, ...packageBins(root, dir, name)];
        if (!scope.some((t) => names.some((n) => mentions(t, n)))) {
          dependencies.push({ package: f.path, name, kind, confidence: kind === 'dependencies' ? 'medium' : 'low' });
        }
      }
    }
  }

  // Assets and modules that nothing refers to by name.
  const orphans = [];
  for (const f of files) {
    if (cfg.orphanIgnore.some((pre) => f.path.startsWith(pre))) continue;
    const base = path.posix.basename(f.path);
    const isMedia = MEDIA_EXT.test(f.path);
    const isModule = SOURCE_EXT.test(f.path) && !/\.(test|spec)\./.test(f.path) && cfg.orphanSourceDirs.some((d) => f.path.startsWith(d));
    if (!isMedia && !isModule) continue;
    const stem = base.replace(/\.[^.]+$/, '');
    const importName = stem === 'index' ? path.posix.basename(path.posix.dirname(f.path)) : stem;
    const used = [...texts].some(([p, t]) => p !== f.path && (isMedia ? t.includes(base) : imports(t, importName)));
    if (!used) orphans.push({ path: f.path, bytes: f.bytes, kind: isMedia ? 'asset' : 'module' });
  }
  orphans.sort((a, b) => b.bytes - a.bytes);

  // Growth since the previous run, and what was added.
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=no']).split('\n').filter(Boolean).length;
  const growth = { previous, deltaBytes: null, deltaPercent: null, alert: false, addedLarge: [], note: null };
  if (previous) {
    growth.deltaBytes = totals.trackedBytes - previous.trackedBytes;
    growth.deltaPercent = previous.trackedBytes ? (growth.deltaBytes / previous.trackedBytes) * 100 : null;
    growth.alert = growth.deltaPercent != null && growth.deltaPercent >= cfg.growthAlertPercent;
    if (previous.head && previous.head !== head) {
      try {
        const added = new Set(git(root, ['diff', '--name-only', '--diff-filter=A', '-z', previous.head, 'HEAD']).split('\0').filter(Boolean));
        growth.addedLarge = large.filter((l) => added.has(l.path)).map(({ path: p, bytes, kind }) => ({ path: p, bytes, kind }));
      } catch { growth.note = `Previous commit ${previous.head.slice(0, 7)} is no longer reachable, so additions can't be listed.`; }
    }
  }

  return {
    meta: { generatedAt: now.toISOString(), head, branch: git(root, ['branch', '--show-current']).trim() || '(detached)', dirty },
    totals, growth, large, junk, ignoreGaps, duplicates, dependencies, skippedTypes, orphans,
  };
}

const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(1)} KB`);
const row = (...cells) => `| ${cells.join(' | ')} |`;

function renderMarkdown(r, limit = 15) {
  const out = [];
  const { totals: t, growth: g } = r;
  out.push(`# Repo bloat report`, '');
  out.push(`Generated ${r.meta.generatedAt} on \`${r.meta.branch}\` at \`${r.meta.head.slice(0, 7)}\`${r.meta.dirty ? ` (${r.meta.dirty} tracked file(s) modified, so figures include uncommitted changes)` : ''}.`, '');
  out.push(`## Totals`, '');
  out.push(`- ${t.trackedFiles} tracked files, ${kb(t.trackedBytes)}; images are ${kb(t.imageBytes)} (${t.trackedBytes ? Math.round((t.imageBytes / t.trackedBytes) * 100) : 0}%).`);
  out.push(`- Git object store: ${kb(t.gitKiB * 1024)}.`);
  if (g.previous) {
    const sign = g.deltaBytes >= 0 ? '+' : '-';
    out.push(`- Since the last run (${g.previous.at.slice(0, 10)}): ${sign}${kb(Math.abs(g.deltaBytes))}${g.deltaPercent == null ? '' : ` (${g.deltaPercent.toFixed(1)}%)`}${g.alert ? ' **over the growth alert threshold**' : ''}.`);
    if (g.note) out.push(`- ${g.note}`);
  } else {
    out.push(`- First run, so there is no earlier figure to compare with.`);
  }
  out.push('', row('Directory', 'Size', 'Files'), row('---', '---', '---'));
  for (const d of t.byDir.slice(0, 8)) out.push(row(d.dir, kb(d.bytes), d.files));

  const section = (title, items, header, fmtRow, empty) => {
    out.push('', `## ${title}`, '');
    if (!items.length) { out.push(empty); return; }
    out.push(row(...header), row(...header.map(() => '---')));
    for (const i of items.slice(0, limit)) out.push(fmtRow(i));
    if (items.length > limit) out.push('', `…and ${items.length - limit} more (see latest.json).`);
  };

  if (g.addedLarge.length) section('Large files added since the last run', g.addedLarge, ['File', 'Size'], (i) => row(`\`${i.path}\``, kb(i.bytes)), '');
  section('Large files and images', r.large, ['File', 'Size', 'Kind'], (i) => row(`\`${i.path}\``, kb(i.bytes), i.kind), 'None over the thresholds.');
  section('Committed junk', r.junk, ['File', 'Size', 'What', 'Fix'],
    (i) => row(`\`${i.path}\``, kb(i.bytes), i.rule, i.ignored ? '`git rm --cached` (already ignored)' : 'add ignore rule, then `git rm --cached`'), 'None found.');
  if (r.ignoreGaps.length) out.push('', `Missing .gitignore rules: ${r.ignoreGaps.map((x) => `\`${x.line}\` (${x.rule})`).join(', ')}.`);
  section('Duplicate files', r.duplicates, ['Copies', 'Each', 'Wasted', 'Paths'],
    (i) => row(i.count, kb(i.bytes), kb(i.wastedBytes), i.paths.map((p) => `\`${p}\``).join(', ')), 'No identical files.');
  section('Declared but unmentioned dependencies', r.dependencies, ['Package', 'Dependency', 'Kind', 'Confidence'],
    (i) => row(`\`${i.package}\``, `\`${i.name}\``, i.kind, i.confidence), `None. (${r.skippedTypes} @types packages not checked.)`);
  section('Unreferenced assets and modules', r.orphans, ['File', 'Size', 'Kind'], (i) => row(`\`${i.path}\``, kb(i.bytes), i.kind), 'None found.');

  out.push('', `## Reading this report`, '',
    '- Large files and junk are measured directly. Duplicates are byte-identical.',
    '- Dependencies and unreferenced files are found by searching for names, so confidence is lower: a path built at run time, a tool wired up by a preset, or a file served by URL can look unused. Check before deleting.');
  return out.join('\n') + '\n';
}

function parseArgs(argv) {
  const a = { root: '.', out: '.bloat', config: 'bloat.config.json', json: false, write: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--json') a.json = true;
    else if (k === '--no-write') a.write = false;
    else if (['--root', '--out', '--config'].includes(k)) a[k.slice(2)] = argv[++i];
    else throw new Error(`Unknown option ${k}`);
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root);
  try { git(root, ['rev-parse', '--git-dir'], { stdio: 'pipe' }); } catch { throw new Error(`${root} is not a git repository`); }
  const configPath = path.resolve(root, args.config);
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
  const outDir = path.resolve(root, args.out);
  const historyPath = path.join(outDir, 'history.jsonl');

  let previous = null;
  if (fs.existsSync(historyPath)) {
    const lines = fs.readFileSync(historyPath, 'utf8').split('\n').filter(Boolean);
    if (lines.length) previous = JSON.parse(lines[lines.length - 1]);
  }

  const report = scan({ root, config, previous });
  const markdown = renderMarkdown(report);
  if (args.write) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outDir, 'latest.md'), markdown);
    const { totals: t, meta, large, junk, duplicates } = report;
    fs.appendFileSync(historyPath, JSON.stringify({
      at: meta.generatedAt, head: meta.head, trackedBytes: t.trackedBytes, trackedFiles: t.trackedFiles, imageBytes: t.imageBytes,
      gitKiB: t.gitKiB, large: large.length, junk: junk.length, duplicateWastedBytes: duplicates.reduce((n, d) => n + d.wastedBytes, 0),
    }) + '\n');
  }
  process.stdout.write(args.json ? JSON.stringify(report, null, 2) + '\n' : markdown);
}

module.exports = { scan, renderMarkdown, matches, mentions, imports };
if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}
