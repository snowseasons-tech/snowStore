'use strict';
const $ = id => document.getElementById(id);
let revision = 0, editRevision = 0;
let records = [], selected = null, dirty = false;
let loaded = false;
let generation = 0;
let workspaceId = null, expiryTimer;
const message = text => { $('message').textContent = text; };
function clearWorkspace() {
  clearTimeout(expiryTimer); workspaceId = null;
  ++generation; records = []; loaded = false; selected = null; dirty = false; editRevision = revision;
  $('billing-note').textContent = '';
  $('editor').reset(); $('editor').hidden = true;
  $('import-form').reset(); $('search').value = ''; $('due-by').value = ''; $('filter').value = ''; $('minimum').value = 0;
  render();
}
async function api(body) {
  const response = await fetch('/api/lead-workspace/leads', { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { ...(body && { 'Content-Type': 'application/json', 'X-Lead-Workspace': workspaceId || '' }) }, ...(body && { body: JSON.stringify({ revision, ...body }) }) });
  if (response.status === 401 || response.status === 403) {
    clearWorkspace(); location.replace('/storefront/lead-workspace');
    throw new Error('Please sign in with an invited pilot account.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error((result.error || 'Request failed.') + (result.requestId ? ' Reference: ' + result.requestId : ''));
  return result;
}
function visible() {
  return records.filter(row => (!$('filter').value || row.stage === $('filter').value) && row.score >= Number($('minimum').value) && ['name','email','website','phone','notes'].some(key => row[key].toLocaleLowerCase().includes($('search').value.toLocaleLowerCase())) && (!$('due-by').value || (row.follow_up && row.follow_up <= $('due-by').value && !['Won','Lost'].includes(row.stage))));
}
function render() {
  const rows = visible();
  $('queue').replaceChildren();
  $('count').textContent = `${rows.length} of ${records.length}`;
  $('empty').hidden = rows.length > 0;
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const value of [row.name, String(row.score), row.stage, row.follow_up || '—']) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    const td = document.createElement('td'), button = document.createElement('button');
    button.type = 'button'; button.textContent = 'Review'; button.setAttribute('aria-label', `Review ${row.name}`);
    button.onclick = () => {
      if (dirty && !confirm('Discard unsaved changes to the current lead?')) return;
      selected = row.id; dirty = false; editRevision = revision;
      $('editor-title').textContent = 'Review lead';
      $('choose').hidden = true; $('editor').hidden = false;
      for (const input of $('editor').elements) if (input.name) input.value = row[input.name];
      message(`Reviewing ${row.name}.`);
    };
    td.append(button); tr.append(td); $('queue').append(tr);
  }
}
async function reload() {
  const current = generation; const result = await api(); if (current !== generation) return;
  if (workspaceId && workspaceId !== result.workspaceId) clearWorkspace();
  workspaceId = result.workspaceId; records = result.leads; revision = result.revision; loaded = true;
  clearTimeout(expiryTimer); expiryTimer = setTimeout(() => { clearWorkspace(); location.replace('/storefront/lead-workspace'); }, Math.max(0, result.expiresAt - Date.now()));
  $('billing-note').textContent = result.access?.status === 'past_due' ? 'Payment is past due. Grace ends ' + new Date(result.access.graceEndsAt).toLocaleString() + '. Update your payment method before then.' : '';
  render();
}
$('filter').onchange = render;
$('minimum').oninput = render;
$('search').oninput = render;
$('due-by').oninput = render;
$('editor').oninput = () => { dirty = true; };
$('new-lead').onclick = () => {
  if (dirty && !confirm('Discard unsaved changes to the current lead?')) return;
  if (!loaded) return message('Wait for the queue to load first.');
  selected = null; dirty = false; editRevision = revision;
  $('editor').reset(); $('editor').hidden = false; $('choose').hidden = true;
  for (const name of ['fit', 'intent', 'budget']) $('editor').elements.namedItem(name).value = 0;
  $('editor-title').textContent = 'Add lead';
  $('editor').elements.namedItem('name').focus();
  message('Enter a new lead, then save.');
};
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
$('editor').onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter; button.disabled = true;
  try {
    const changes = Object.fromEntries(new FormData($('editor')));
    if (selected === null) {
      const result = await api({ action: 'create', lead: changes, revision: editRevision });
      selected = result.id;
    } else {
      await api({ action: 'update', id: selected, changes, revision: editRevision });
    }
    $('editor-title').textContent = 'Review lead';
    dirty = false; $('editor').hidden = true; $('choose').hidden = false; selected = null; await reload(); message('Changes saved to your workspace.');
  } catch (error) { message(error.message); } finally { button.disabled = false; }
};
$('import-form').onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter; button.disabled = true;
  try {
    const file = $('csv').files[0];
    if (!loaded) throw new Error('Wait for the queue to load first.');
    if (!file || file.size > 250000) throw new Error('Choose a CSV file smaller than 250 KB.');
    const mapping = $('mapping').value.trim() ? JSON.parse($('mapping').value) : {};
    const result = await api({ action: 'import', leads: leadCsv.parse(await file.text(), mapping) });
    await reload(); message(`Imported ${result.added} leads; skipped ${result.duplicates_skipped} duplicates.`);
  } catch (error) { message(error.message); } finally { button.disabled = false; }
};
$('export').onclick = async () => {
  try {
    if (!$('minimum').checkValidity()) throw new Error('Minimum score must be a whole number from 0 to 100.');
    await reload();
    const url = URL.createObjectURL(new Blob([leadCsv.stringify(visible())], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
    link.href = url; link.download = 'leads-export.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('CSV exported. Review field mapping before importing into your CRM.');
  } catch (error) { message(error.message); }
};
$('reload-queue').onclick = async () => {
  try { await reload(); message('Queue reloaded. Reopen the lead to load its latest values before saving again. Copy any unsaved edits first.'); }
  catch (error) { message(error.message); }
};
window.addEventListener('pagehide', clearWorkspace);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) reload().catch(error => message(error.message));
});
window.addEventListener('pageshow', () => { if (!loaded) reload().catch(error => message(error.message)); });
reload().then(() => message('Workspace ready. Import a CSV or add a lead.')).catch(error => message(error.message));
