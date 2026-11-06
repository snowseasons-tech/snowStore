'use strict';
const $ = id => document.getElementById(id);
let workspace, reviewId, generation = 0, expiryTimer;
const say = text => { $('status').textContent = text; };
function clear() {
  ++generation; clearTimeout(expiryTimer); workspace = null; reviewId = null;
  $('controls').hidden = true; $('leads').replaceChildren(); $('results').replaceChildren(); $('preview').textContent = ''; $('send').hidden = true; $('token').value = '';
}
async function crm(body) {
  const response = await fetch('/api/lead-workspace/crm', { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { ...(body && { 'Content-Type': 'application/json', 'X-Lead-Workspace': workspace?.workspaceId || '' }) }, ...(body && { body: JSON.stringify(body) }) });
  if (response.status === 401) { clear(); location.replace('/storefront/lead-workspace'); throw new Error('Please sign in again.'); }
  const result = await response.json();
  if (!response.ok) throw new Error((result.error || 'CRM request failed.') + (result.requestId ? ' Reference: ' + result.requestId : ''));
  return result;
}
function results(data) {
  $('connection').textContent = data.connected ? 'HubSpot key is connected. Read access was verified; write scope is checked when delivering.' : 'No HubSpot connection.';
  $('disconnect').disabled = !data.connected;
  $('results').replaceChildren();
  for (const review of data.reviews) {
    const article = document.createElement('article');
    const title = document.createElement('h3'); title.textContent = 'Review ' + review.reviewId.slice(0, 10); article.append(title);
    for (const row of review.rows) {
      const p = document.createElement('p');
      p.textContent = `${row.name}: ${row.status} · attempt ${row.attempts}` + (row.remoteId ? ` · HubSpot ID ${row.remoteId}` : '') + (row.message ? ` · ${row.message}` : '') + (row.retryAt ? ' · retry after ' + new Date(row.retryAt).toLocaleString() : '');
      article.append(p);
    }
    if (review.rows.some(row => ['retryable', 'inflight'].includes(row.status))) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Retry reviewed delivery'; button.disabled = review.running;
      button.onclick = () => deliver(review.reviewId, button); article.append(button);
    }
    $('results').append(article);
  }
}
async function refresh() { const current = generation; const data = await crm(); if (current === generation) results(data); }
async function load() {
  const current = ++generation;
  const response = await fetch('/api/lead-workspace/leads', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) { clear(); location.replace('/storefront/lead-workspace'); return; }
  const data = await response.json();
  if (current !== generation) return;
  if (workspace && workspace.workspaceId !== data.workspaceId) { clear(); return load(); }
  workspace = data;
  clearTimeout(expiryTimer); expiryTimer = setTimeout(() => { clear(); location.replace('/storefront/lead-workspace'); }, Math.max(0, data.expiresAt - Date.now()));
  const state = await crm(); if (current !== generation) return; results(state);
  invalidateReview();
  $('leads').replaceChildren();
  for (const lead of data.leads) {
    const label = document.createElement('label'); label.className = 'crm-choice';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = lead.id;
    const text = document.createElement('span'); text.textContent = lead.name + ' · ' + (lead.email || 'No email'); label.append(input, text); $('leads').append(label);
  }
  $('controls').hidden = false; say('HubSpot delivery is ready. Review the destination account and fields before sending.');
}
function invalidateReview() { reviewId = null; $('send').hidden = true; $('preview').textContent = ''; $('review-note').textContent = 'Prepare a preview to see the exact fields that will be sent.'; }
const propertyLabels = { email: 'Contact email', company: 'Company', phone: 'Phone', website: 'Website' };
const sourceLabels = { email: 'Email', name: 'Organization name', phone: 'Phone', website: 'Website', notes: 'Notes', stage: 'Stage', follow_up: 'Follow-up date' };
for (const [target, labelText] of Object.entries(propertyLabels)) {
  const label = document.createElement('label'); label.textContent = labelText;
  const select = document.createElement('select'); select.dataset.target = target;
  for (const [source, text] of [...(target === 'email' ? [] : [['', 'Do not send']]), ...Object.entries(sourceLabels)]) {
    const option = document.createElement('option'); option.value = source; option.textContent = text; select.append(option);
  }
  select.value = target === 'company' ? 'name' : target; label.append(select); $('mapping').append(label);
}
$('mapping').onchange = invalidateReview;
function mappingValues() {
  const mapping = {};
  for (const select of $('mapping').querySelectorAll('select')) {
    if (!select.value) continue;
    if (Object.hasOwn(mapping, select.value)) throw new Error('Choose a different lead field for each HubSpot value.');
    mapping[select.value] = select.dataset.target;
  }
  return mapping;
}
function showPreview(rows) {
  $('preview').replaceChildren();
  for (const row of rows) {
    const article = document.createElement('article'), title = document.createElement('h3'); title.textContent = row.name; article.append(title);
    const list = document.createElement('ul');
    for (const [key, value] of Object.entries(row.properties)) { const item = document.createElement('li'); item.textContent = (propertyLabels[key] || key) + ': ' + value; list.append(item); }
    article.append(list);
    if (row.error) { const error = document.createElement('p'); error.textContent = row.error; article.append(error); }
    $('preview').append(article);
  }
}
$('leads').onchange = invalidateReview;
$('connect').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { await crm({ action: 'connect', token: $('token').value }); reviewId = null; $('send').hidden = true; $('preview').textContent = ''; await refresh(); say('HubSpot connection saved. Prepare a new preview before sending.'); }
  catch (error) { say(error.message); }
  finally { $('token').value = ''; button.disabled = false; }
};
$('disconnect').onclick = async () => {
  try { await crm({ action: 'disconnect' }); reviewId = null; $('send').hidden = true; $('preview').textContent = ''; await refresh(); say('HubSpot disconnected. Stored credentials have been removed.'); }
  catch (error) { say(error.message); }
};
$('review').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('send').hidden = true; reviewId = null;
  try {
    const result = await crm({ action: 'review', revision: workspace.revision, selectedIds: [...$('leads').querySelectorAll('input:checked')].map(input => input.value), mapping: mappingValues() });
    showPreview(result.rows);
    $('review-note').textContent = result.valid ? 'These exact values will create or update HubSpot contacts. Confirm below to deliver.' : 'Correct the listed errors and prepare a new preview.';
    reviewId = result.reviewId; $('send').hidden = !result.valid;
  } catch (error) { say(error.message); } finally { button.disabled = false; }
};
async function deliver(id, button) {
  button.disabled = true;
  try { await crm({ action: 'send', reviewId: id }); $('send').hidden = true; await refresh(); say('Delivery attempt finished. Review each contact result below.'); }
  catch (error) { say(error.message); await refresh().catch(() => {}); }
  finally { button.disabled = false; }
}
$('send').onclick = () => deliver(reviewId, $('send'));
$('refresh').onclick = () => load().catch(error => say(error.message));
window.addEventListener('pagehide', clear);
window.addEventListener('pageshow', () => { if (!workspace) load().catch(error => say(error.message)); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) load().catch(error => { clear(); say(error.message); }); });
load().catch(error => say(error.message));
