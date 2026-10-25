#!/usr/bin/env node
// Create or update a customer portal account in the production store.
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node scripts/add-user.js customer@example.com bookscan[,other]
// The password is read from stdin (not argv) so it stays out of shell history.
// With --invite, no password is asked for: the customer is emailed a 7-day link to choose their own
// (needs SITE_URL, RESEND_API_KEY and MAIL_FROM too; without email settings the link is printed instead).
// An existing account keeps its current password until the customer uses the link.
const readline = require('readline');
const CATALOG = require('../api/_lib/catalog');
const store = require('../api/_lib/store');
const auth = require('../api/_lib/auth');
const mail = require('../api/_lib/mail');

async function main() {
  const args = process.argv.slice(2);
  const invite = args.includes('--invite');
  const [emailArg, productsArg = ''] = args.filter((a) => a !== '--invite');
  const email = auth.normEmail(emailArg);
  if (!email || !email.includes('@')) throw new Error('usage: node scripts/add-user.js [--invite] <email> <product1,product2>');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) throw new Error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
  if (invite && !process.env.SITE_URL) throw new Error('Set SITE_URL to build the invite link');
  const products = productsArg.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = products.filter((id) => !Object.prototype.hasOwnProperty.call(CATALOG, id));
  if (unknown.length) throw new Error(`unknown product(s): ${unknown.join(', ')}`);

  if (invite) {
    const existing = await store.getJSON(`user:${email}`);
    const user = { hash: existing ? existing.hash : null, products };
    await store.setJSON(`user:${email}`, user);
    const token = await auth.createPasswordLink(email, user, auth.INVITE_TTL_SEC);
    const msg = auth.passwordLinkMail(email, token, { invite: true });
    const sent = await mail.sendMail(msg);
    console.error(`Saved ${email} with access to: ${products.join(', ') || '(nothing yet)'}`);
    if (sent === 'sent') console.error(`Invite emailed to ${email}`);
    else console.error(`Email is not configured; send this 7-day link to the customer yourself:\n${msg.text.match(/https?:\S+/)[0]}`);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const password = await new Promise((resolve) => rl.question(`Password (min ${auth.PASSWORD_MIN} chars): `, (a) => { rl.close(); resolve(a); }));
  if (password.length < auth.PASSWORD_MIN) throw new Error(`Password must be at least ${auth.PASSWORD_MIN} characters`);

  await store.setJSON(`user:${email}`, { hash: await auth.hashPassword(password), products });
  console.error(`Saved ${email} with access to: ${products.join(', ') || '(nothing yet)'}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
