#!/usr/bin/env node
// Local stand-in for the Upstash Redis REST API, so `wrangler pages dev` can run the stateful Functions
// (kit signup, portal login, downloads) without a real database. Speaks the commands api/_lib/store.js sends:
// GET, SET [NX] [EX s], DEL, INCR, and the INCR-with-TTL EVAL script. Data lives in memory until the process
// exits. GET /__keys dumps every key and value as JSON, for checking what a flow wrote.
//   node .claude/skills/run-snowstore/fake-upstash.mjs [port]   (default 8790)
import { createServer } from 'node:http';

const port = Number(process.argv[2] || process.env.FAKE_UPSTASH_PORT || 8790);
const data = new Map();
const expiry = new Map();

function get(key) {
  if (expiry.has(key) && expiry.get(key) <= Date.now()) { data.delete(key); expiry.delete(key); }
  return data.has(key) ? data.get(key) : null;
}
function setTtl(key, sec) { if (sec) expiry.set(key, Date.now() + Number(sec) * 1000); }

function run([op, ...a]) {
  switch (String(op).toUpperCase()) {
    case 'GET': return get(a[0]);
    case 'DEL': { const had = get(a[0]) !== null; data.delete(a[0]); expiry.delete(a[0]); return had ? 1 : 0; }
    case 'SET': {
      const [key, value, ...opts] = a;
      const flags = opts.map((o) => String(o).toUpperCase());
      if (flags.includes('NX') && get(key) !== null) return null;
      data.set(key, String(value));
      expiry.delete(key);
      const ex = flags.indexOf('EX');
      if (ex !== -1) setTtl(key, opts[ex + 1]);
      return 'OK';
    }
    case 'INCR': { const n = Number(get(a[0]) || 0) + 1; data.set(a[0], String(n)); return n; }
    case 'EVAL': {
      // Only the INCR-with-TTL script from store.js: EVAL <script> 1 <key> <ttl>
      const [, , key, ttl] = a;
      const n = Number(get(key) || 0) + 1;
      data.set(key, String(n));
      if (!expiry.has(key)) setTtl(key, ttl);
      return n;
    }
    default: throw new Error(`unsupported command ${op}`);
  }
}

createServer((req, res) => {
  const reply = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'GET' && req.url === '/__keys') {
    const out = {};
    for (const k of [...data.keys()].sort()) { const v = get(k); if (v !== null) out[k] = v; }
    return reply(200, out);
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const args = JSON.parse(body);
      const result = run(args);
      console.log(`${args[0]} ${args[0] === 'EVAL' ? args[3] : args[1]} -> ${JSON.stringify(result)}`);
      reply(200, { result });
    } catch (e) {
      console.log(`error: ${e.message}`);
      reply(400, { error: e.message });
    }
  });
}).listen(port, '127.0.0.1', () => console.log(`fake-upstash ready on http://127.0.0.1:${port}`));
