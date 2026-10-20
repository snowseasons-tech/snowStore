#!/usr/bin/env node
// Headless Chrome driver for the storefront and the standalone product pages, over the DevTools protocol.
// No dependencies: Node 20+ (built-in WebSocket needs Node 22, or 21 with --experimental-websocket) and Chrome.
// Reads one command per line from stdin and stops at the first failure (exit 1).
//
//   node .claude/skills/run-snowstore/driver.mjs <<'EOF'
//   nav http://127.0.0.1:8788/
//   wait-for #kit-form
//   screenshot home
//   EOF
//
// Commands:
//   viewport <w> <h> [mobile]     emulate a screen size (default 1280 800)
//   media <name>=<value> ...      e.g. prefers-color-scheme=dark prefers-reduced-motion=reduce
//   nav <url>                     load a page (http:// or file://) and wait for the load event
//   wait-for <css> [ms]           wait until the element exists and is visible (default 10000 ms)
//   wait-text <text>              wait until the page text contains <text>
//   wait-js <js>                  wait until the JS expression is truthy (15000 ms), e.g. a chart finished loading
//   click <css>                   scroll into view, then a real mouse click at the element's center
//   fill <css> <value>            replace an input's value by typing (selects: set value + change event).
//                                 The selector is the first word, so it can't contain spaces: use #id or a>b.
//   (click, wait-for and scroll-to take the whole rest of the line as the selector, spaces included.)
//   press <key>                   Enter, Escape, Tab, ArrowDown, ...
//   scroll-to <css>               scrollIntoView (pages that scroll inside <main> ignore window scrolling)
//   eval <js>                     run JS in the page and print the JSON result
//   assert <js>                   fail unless the JS expression is truthy
//   screenshot [name]             save a PNG of the viewport to $SHOTS_DIR (default /tmp/snowstore-shots)
//   stub <host>                   answer every request to <host> with a dummy attachment (for the fake bucket)
//   stubbed                       print the URLs the stub answered
//   errors                        print uncaught exceptions and console.error calls seen so far
//   assert-no-errors              fail if there were any
//   sleep <ms>
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SHOTS = process.env.SHOTS_DIR || '/tmp/snowstore-shots';
const CHROME = process.env.CHROME || 'google-chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(SHOTS, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'snowstore-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };

// Port 0 lets Chrome pick a free port; it writes the choice to DevToolsActivePort in the profile.
let port;
for (let i = 0; i < 100 && !port; i++) {
  await wait(100);
  const f = join(profile, 'DevToolsActivePort');
  if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0];
}
if (!port) { console.error('FAIL: Chrome did not start (set CHROME=/path/to/chrome?)'); cleanup(); process.exit(1); }
const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
const sock = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => sock.addEventListener('open', r));

let seq = 0;
const pending = new Map();
const listeners = new Map();
const pageErrors = [];
sock.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') pageErrors.push(`exception: ${d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text}`);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') pageErrors.push(`console.error: ${d.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  (listeners.get(d.method) || []).forEach((fn) => fn(d.params));
});
const cmd = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++seq, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
  sock.send(JSON.stringify({ id: seq, method, params }));
});
const once = (method) => new Promise((r) => { const fns = listeners.get(method) || []; const fn = (p) => { listeners.set(method, (listeners.get(method) || []).filter((x) => x !== fn)); r(p); }; listeners.set(method, [...fns, fn]); });
async function js(expression) {
  const r = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const q = (sel) => JSON.stringify(sel);
async function poll(check, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(check)) return; await wait(100); }
  throw new Error(`timed out after ${ms} ms waiting for ${what}`);
}
const visible = (sel) => `(() => { const e = document.querySelector(${q(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; })()`;
const stubHosts = new Set();
const stubbedUrls = [];
const KEYS = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, ' ': 32 };

const setViewport = (w, h, mobile) => cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });

await cmd('Page.enable');
await cmd('Runtime.enable');
await setViewport(1280, 800, false);

const commands = {
  async viewport(w, h, mobile) { await setViewport(+w, +h, mobile === 'mobile'); },
  async media(...pairs) { await cmd('Emulation.setEmulatedMedia', { features: pairs.map((p) => { const [name, value] = p.split('='); return { name, value }; }) }); },
  async nav(url) { const loaded = once('Page.loadEventFired'); const r = await cmd('Page.navigate', { url }); if (r.errorText) throw new Error(`${url}: ${r.errorText}`); await Promise.race([loaded, wait(30000)]); },
  async 'wait-for'(...words) {
    const ms = /^\d+$/.test(words[words.length - 1]) && words.length > 1 ? +words.pop() : 10000;
    const sel = words.join(' ');
    await poll(visible(sel), ms, sel);
  },
  async 'wait-js'(...code) { const expr = code.join(' '); await poll(`!!(${expr})`, 15000, expr); },
  async 'wait-text'(...words) { const t = words.join(' '); await poll(`document.body && document.body.innerText.includes(${q(t)})`, 10000, `text "${t}"`); },
  async click(...words) {
    const sel = words.join(' ');
    await poll(visible(sel), 10000, sel);
    // Wait for the element to stop moving: a click computed mid-transition (e.g. the dashboard sidebar sliding
    // after a viewport change) lands on whatever is under the old position.
    const rect = `(() => { const e = document.querySelector(${q(sel)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;
    let box = await js(rect);
    for (let i = 0; i < 30; i++) {
      await wait(100);
      const next = await js(rect);
      if (Math.abs(next.x - box.x) < 0.5 && Math.abs(next.y - box.y) < 0.5) break;
      box = next;
    }
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  },
  async fill(sel, ...words) {
    const value = words.join(' ');
    await poll(`!!document.querySelector(${q(sel)})`, 10000, sel);
    const tag = await js(`(() => { const e = document.querySelector(${q(sel)}); e.scrollIntoView({ block: 'center' }); e.focus(); if (e.select) e.select(); return e.tagName; })()`);
    if (tag === 'SELECT') {
      await js(`(() => { const e = document.querySelector(${q(sel)}); e.value = ${q(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    } else {
      await js(`(() => { const e = document.querySelector(${q(sel)}); if (!e.select) e.textContent = ''; })()`);
      await cmd('Input.insertText', { text: value });
    }
  },
  async press(key) {
    const code = KEYS[key] || key.toUpperCase().charCodeAt(0);
    for (const type of ['keyDown', 'keyUp']) await cmd('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, ...(key === 'Enter' && type === 'keyDown' ? { text: '\r' } : {}) });
  },
  async 'scroll-to'(...words) { const sel = words.join(' '); await poll(`!!document.querySelector(${q(sel)})`, 10000, sel); await js(`document.querySelector(${q(sel)}).scrollIntoView({ block: 'start' })`); await wait(300); },
  async eval(...code) { console.log(JSON.stringify(await js(code.join(' ')))); },
  async assert(...code) { const expr = code.join(' '); if (!(await js(expr))) throw new Error(`assertion failed: ${expr}`); },
  async screenshot(name = `shot-${Date.now()}`) {
    const r = await cmd('Page.captureScreenshot', { format: 'png' });
    const file = join(SHOTS, `${name}.png`);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log(`screenshot ${file}`);
  },
  async stub(host) {
    // Signed download URLs point at the bucket host; locally that host doesn't exist, and navigating to it would
    // replace the page with Chrome's error page.
    if (!stubHosts.size) {
      listeners.set('Fetch.requestPaused', [async ({ requestId, request }) => {
        stubbedUrls.push(request.url);
        await cmd('Fetch.fulfillRequest', { requestId, responseCode: 200, body: Buffer.from('stubbed by driver.mjs\n').toString('base64'),
          responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }, { name: 'Content-Disposition', value: 'attachment; filename="stub.txt"' }] });
      }]);
    }
    stubHosts.add(host);
    await cmd('Fetch.enable', { patterns: [...stubHosts].map((h) => ({ urlPattern: `*://${h}/*` })) });
  },
  async stubbed() { console.log(stubbedUrls.length ? stubbedUrls.map((u) => u.replace(/\?.*/, '?…')).join('\n') : 'nothing stubbed yet'); },
  async errors() { console.log(pageErrors.length ? pageErrors.join('\n') : 'no page errors'); },
  async 'assert-no-errors'() { if (pageErrors.length) throw new Error(`page errors:\n${pageErrors.join('\n')}`); },
  async sleep(ms) { await wait(+ms); },
};

const lines = readFileSync(0, 'utf8').split('\n');
let code = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line || line.startsWith('#')) continue;
  const [name, ...args] = line.split(/\s+/);
  const fn = commands[name];
  try {
    if (!fn) throw new Error(`unknown command "${name}"`);
    await fn(...args);
    if (!['eval', 'screenshot', 'errors', 'stubbed'].includes(name)) console.log(`ok   ${line}`);
  } catch (e) {
    console.error(`FAIL line ${i + 1}: ${line}\n     ${e.message}`);
    code = 1;
    break;
  }
}
sock.close();
cleanup();
process.exit(code);
