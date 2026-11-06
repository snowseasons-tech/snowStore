'use strict';
const $ = id => document.getElementById(id);
let expiryTimer;
let generation = 0;
function signedOut(text) {
  clearTimeout(expiryTimer);
  $('account').hidden = true; $('signin').hidden = false;
  $('identity').textContent = ''; $('status').textContent = text;
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
    $('status').textContent = 'Signed in. Hosted lead records are still in development.';
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
$('refresh').onclick = checkSession;
window.addEventListener('pageshow', checkSession);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkSession(); });
// This hosted page deliberately never reads the local server's fragment token.
checkSession();
