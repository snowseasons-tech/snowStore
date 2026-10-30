#!/usr/bin/env node
// Meta and Google need every redirect address listed in advance, so all subscribers share https://oauth.$HOSTED_DOMAIN.
// This sends each sign-in back to the right server, using the subscriber id at the start of the OAuth state.
import http from 'node:http';
import { fileURLToPath } from 'node:url';

export function relayTarget(url, domain) {
  const { pathname, searchParams } = new URL(url, 'http://relay');
  const id = (searchParams.get('state') || '').split('~')[0];
  if (!/^\/api\/oauth\/(meta|google)\/callback$/.test(pathname) || !/^[a-z0-9]{6,40}$/.test(id)) return null;
  return `https://${id}.${domain}${pathname}?${searchParams}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const domain = process.env.HOSTED_DOMAIN;
  if (!domain) throw new Error('Set HOSTED_DOMAIN');
  http.createServer((req, res) => {
    const target = req.method === 'GET' ? relayTarget(req.url, domain) : null;
    res.writeHead(target ? 302 : 404, target ? { Location: target } : {});
    res.end();
  }).listen(Number(process.env.RELAY_PORT || 18000), '127.0.0.1');
}
