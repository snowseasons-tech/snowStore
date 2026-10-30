#!/usr/bin/env node
// Starts the Launcher, drives it in headless Chrome, saves a screenshot. Run from launcher/.
import { spawn, execFileSync } from 'node:child_process';
const PORT = 5199, URL_ = `http://127.0.0.1:${PORT}/`, SHOT = '/tmp/launcher.png';
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true });
try {
  let html = '';
  for (let i = 0; i < 40 && !html; i++) {
    html = await fetch(URL_).then((r) => r.text()).catch(() => '');
    if (!html) await new Promise((r) => setTimeout(r, 250));
  }
  if (!html.includes('id="root"')) throw new Error('server did not start');
  const chrome = (...a) => execFileSync('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=5000', ...a, URL_], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const dom = chrome('--dump-dom');
  const rows = (dom.match(/<li[ >]/g) || []).length;
  if (rows !== 18 || !dom.includes('Launcher')) throw new Error(`expected 18 rows, got ${rows}`);
  chrome(`--screenshot=${SHOT}`, '--window-size=900,1000');
  console.log(`ok: ${rows} rows, screenshot ${SHOT}`);
} finally { process.kill(-vite.pid); }
