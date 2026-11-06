import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { workspaceKey, LeadError } from './lead-data.js';

function keyFor(env) {
  const encoded = env.LEAD_CRM_ENCRYPTION_KEY || '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new LeadError(503, 'CRM credential encryption is not configured.');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new LeadError(503, 'CRM credential encryption is not configured.');
  return key;
}
export function encryptCredential(email, token, env) {
  if (typeof token !== 'string' || !token.trim() || token.length > 4096 || /[\u0000-\u001f\u007f]/.test(token)) throw new LeadError(400, 'Enter a valid CRM credential.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(env), iv);
  cipher.setAAD(Buffer.from(workspaceKey(email)));
  const ciphertext = Buffer.concat([cipher.update(token.trim(), 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
export function decryptCredential(email, record, env) {
  try {
    if (record?.version !== 1) throw new Error('Unsupported credential version');
    const decipher = createDecipheriv('aes-256-gcm', keyFor(env), Buffer.from(record.iv, 'base64'));
    decipher.setAAD(Buffer.from(workspaceKey(email)));
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new LeadError(503, 'CRM credential could not be opened. Ask the operator to check the encryption key or reconnect.');
  }
}
