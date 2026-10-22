// Customer portal auth: admin-provisioned accounts, scrypt password hashes, opaque server-side sessions.
// Account record  user:<email> = { hash, products: [catalogId, ...] }  (create with scripts/add-user.js)
// Session record  sess:<sha256(token)> = { email, cred }  (the raw token only ever lives in the HttpOnly cookie;
//                 cred fingerprints the password hash, so changing the password ends existing sessions)
const crypto = require('crypto');
const store = require('./store');

const COOKIE = 'ss_session';
const SESSION_TTL_SEC = 8 * 60 * 60;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const LOGIN_WINDOW_SEC = 15 * 60;
// Failed attempts per window. The per-email ceiling is high so a stranger can't easily lock a customer out;
// the tight limit is per (ip, email).
const LOGIN_MAX_PER_IP = 20;
const LOGIN_MAX_PER_IP_EMAIL = 8;
const LOGIN_MAX_PER_EMAIL = 100;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();

function scrypt(password, salt, { N, r, p, keylen }) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))));
}

// Format: scrypt$N$r$p$<salt b64>$<hash b64>
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}
async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), { N: +N, r: +r, p: +p, keylen: expected.length });
  return crypto.timingSafeEqual(key, expected);
}

// Unknown emails still pay for one scrypt so response time doesn't reveal which accounts exist.
let dummyHash;
async function checkCredentials(email, password, s = store) {
  const user = await s.getJSON(`user:${normEmail(email)}`);
  if (!user) {
    dummyHash = dummyHash || (await hashPassword(crypto.randomBytes(16).toString('hex')));
    await verifyPassword(password, dummyHash);
    return null;
  }
  return (await verifyPassword(password, user.hash)) ? user : null;
}

const limitKeys = (ip, email) => {
  const e = sha256(normEmail(email));
  return [[`rl:login:ip:${ip}`, LOGIN_MAX_PER_IP], [`rl:login:ipemail:${sha256(ip)}:${e}`, LOGIN_MAX_PER_IP_EMAIL], [`rl:login:email:${e}`, LOGIN_MAX_PER_EMAIL]];
};
// Returns true when the caller has used up any failed-attempt limit for the current window.
async function loginLimited(ip, email, s = store) {
  for (const [key, max] of limitKeys(ip, email)) if ((await s.count(key)) >= max) return true;
  return false;
}
// Only failed sign-ins count, so customers who sign in often are never locked out.
async function recordLoginFailure(ip, email, s = store) {
  for (const [key] of limitKeys(ip, email)) await s.incr(key, LOGIN_WINDOW_SEC);
}

const credOf = (user) => sha256(String(user.hash || ''));

async function createSession(email, user, s = store) {
  const token = crypto.randomBytes(32).toString('base64url');
  await s.setJSON(`sess:${sha256(token)}`, { email: normEmail(email), cred: credOf(user), createdAt: Date.now() }, SESSION_TTL_SEC);
  return token;
}
function readToken(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{20,100})`));
  return m ? m[1] : null;
}
// Resolves the signed-in account, or null. Dropped accounts and changed passwords end sessions immediately.
async function getSession(req, s = store) {
  const token = readToken(req);
  if (!token) return null;
  const sess = await s.getJSON(`sess:${sha256(token)}`);
  if (!sess) return null;
  const user = await s.getJSON(`user:${sess.email}`);
  if (!user || sess.cred !== credOf(user)) return null;
  return { email: sess.email, products: user.products || [] };
}
async function destroySession(req, s = store) {
  const token = readToken(req);
  if (token) await s.release(`sess:${sha256(token)}`);
}

// Set-password links (forgotten password, or an admin invite to a new account without a password).
// Link record  pwlink:<sha256(token)> = { email, cred }. The token travels in the portal URL's #fragment, so it
// never reaches server logs; it is used up when the password is set, and binding it to cred kills every other
// outstanding link for the account at the same moment.
const PASSWORD_MIN = 12;
const RESET_TTL_SEC = 60 * 60;
const INVITE_TTL_SEC = 7 * 24 * 60 * 60;

async function createPasswordLink(email, user, ttlSec, s = store) {
  const token = crypto.randomBytes(32).toString('base64url');
  await s.setJSON(`pwlink:${sha256(token)}`, { email: normEmail(email), cred: credOf(user) }, ttlSec);
  return token;
}
// Returns the account email, or null if the link is unknown, expired or already used.
async function setPasswordFromLink(token, password, s = store) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(String(token || ''))) return null;
  const key = `pwlink:${sha256(token)}`;
  const link = await s.getJSON(key);
  const user = link && (await s.getJSON(`user:${link.email}`));
  if (!user || link.cred !== credOf(user)) return null;
  await s.setJSON(`user:${link.email}`, { ...user, hash: await hashPassword(password) });
  await s.release(key);
  return link.email;
}
function passwordLinkMail(email, token, { invite = false } = {}, env = process.env) {
  const url = `${env.SITE_URL}/storefront/portal#set-password=${token}`;
  return invite
    ? { to: email, subject: 'Your Snow Seasons Tech account',
      text: `An account has been set up for you to download your Snow Seasons Tech products.\n\nChoose your password within 7 days here:\n${url}\n\nSnow Seasons Tech` }
    : { to: email, subject: 'Reset your password',
      text: `Use this link within 1 hour to choose a new password for your Snow Seasons Tech account:\n${url}\n\nIf you didn't ask for this, you can ignore this email; your password stays the same.\n\nSnow Seasons Tech` };
}

function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SEC}`;
}
const clearCookie = () => `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = {
  normEmail, hashPassword, verifyPassword, checkCredentials, loginLimited, recordLoginFailure,
  createSession, getSession, destroySession, sessionCookie, clearCookie, clientIp,
  PASSWORD_MIN, RESET_TTL_SEC, INVITE_TTL_SEC, createPasswordLink, setPasswordFromLink, passwordLinkMail,
};
