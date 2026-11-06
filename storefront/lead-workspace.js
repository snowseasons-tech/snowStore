'use strict';
const $ = id => document.getElementById(id);
let expiryTimer;
let generation = 0;
let accountWorkspaceId = null, checkoutIntent = null;
function signedOut(text) {
  clearTimeout(expiryTimer);
  $('account').hidden = true; $('signin').hidden = false;
  $('identity').textContent = ''; $('open-workspace').hidden = true; $('manage-billing').hidden = true; $('pilot-checkout').hidden = true; accountWorkspaceId = null; checkoutIntent = null; $('status').textContent = text;
}
async function checkSession() {
  const current = ++generation;
  try {
    const response = await fetch('/api/lead-workspace/session', { credentials: 'same-origin', cache: 'no-store' });
    const body = await response.json();
    if (current !== generation) return;
    if (response.status === 401) return signedOut('Sign in to check workspace availability.');
    if (!response.ok) throw new Error(body.error || 'Unable to verify your session.');
    clearTimeout(expiryTimer);
    $('signin').hidden = true; $('account').hidden = false;
    $('identity').textContent = body.email;
    $('open-workspace').hidden = !body.workspaceEnabled;
    $('manage-billing').hidden = !body.billingEnabled;
    accountWorkspaceId = body.workspaceId;
    $('pilot-checkout').hidden = !body.sandboxCheckoutAvailable || body.workspaceEnabled;
    $('workspace-notice').textContent = body.workspaceEnabled ? 'Your workspace is available. Records are stored separately for your account. Open HubSpot delivery from the editor when it is enabled for your environment.' : (body.access?.reason || 'Hosted lead access is limited to invited pilot accounts. No purchase is enabled by this page.');
    $('status').textContent = body.workspaceEnabled ? (body.access?.status === 'past_due' ? 'Your workspace is available during the seven-day payment grace period.' : 'Signed in. Your workspace is ready.') : 'Signed in. Workspace access is currently unavailable.';
    if (body.access?.graceEndsAt) $('workspace-notice').textContent += ' Payment grace ends ' + new Date(body.access.graceEndsAt).toLocaleString() + '.';
    expiryTimer = setTimeout(() => { ++generation; signedOut('Your session expired. Please sign in again.'); }, Math.max(0, body.expiresAt - Date.now()));
  } catch (error) {
    if (current === generation) signedOut(error.message);
  }
}
$('login').onsubmit = async event => {
  event.preventDefault(); $('login-button').disabled = true;
  try {
    const form = new FormData($('login'));
    const response = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Sign-in failed.');
    await checkSession();
  } catch (error) { signedOut(error.message); }
  finally { $('login').elements.namedItem('password').value = ''; $('login-button').disabled = false; }
};
$('logout').onclick = async () => {
  ++generation;
  $('logout').disabled = true;
  try {
    const response = await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('Sign-out failed. Please retry.');
    signedOut('Signed out.');
  } catch (error) { $('status').textContent = error.message; }
  finally { $('logout').disabled = false; }
};
$('pilot-checkout').onclick = async () => {
  $('pilot-checkout').disabled = true; checkoutIntent ||= crypto.randomUUID();
  try {
    const response = await fetch('/api/lead-workspace/pilot-checkout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Lead-Workspace': accountWorkspaceId || '' }, body: JSON.stringify({ requestId: checkoutIntent }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Sandbox checkout unavailable.');
    const url = new URL(body.url); if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Invalid sandbox checkout link.');
    checkoutIntent = null; location.assign(url.href);
  } catch (error) { $('status').textContent = error.message; }
  finally { $('pilot-checkout').disabled = false; }
};
$('manage-billing').onclick = async () => {
  $('manage-billing').disabled = true;
  try {
    const response = await fetch('/api/lead-workspace/billing-portal', { method: 'POST', credentials: 'same-origin' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Billing management unavailable.');
    const url = new URL(body.url);
    if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com') throw new Error('Invalid billing link.');
    location.assign(url.href);
  } catch (error) { $('status').textContent = error.message; }
  finally { $('manage-billing').disabled = false; }
};
$('refresh').onclick = checkSession;
window.addEventListener('pageshow', checkSession);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkSession(); });
// This hosted page deliberately never reads the local server's fragment token.
checkSession();
