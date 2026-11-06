'use strict';
const $ = id => document.getElementById(id);
const fragment = new URLSearchParams(location.hash.slice(1));
const token = fragment.get('token') || sessionStorage.getItem('lead-workspace-token') || '';
if (token) sessionStorage.setItem('lead-workspace-token', token);
history.replaceState(null, '', location.pathname);
let records = [], selected = null, dirty = false;
const message = text => { $('message').textContent = text; };
async function api(path, body) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'X-Workspace-Token': token, ...(body && { 'Content-Type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }) });
  if (!response.ok) {
    const detail = await response.json();
    throw new Error(detail.error || 'Request failed.');
  }
  return response;
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
      selected = row.id; dirty = false;
      $('editor-title').textContent = 'Review lead';
      $('choose').hidden = true; $('editor').hidden = false;
      for (const input of $('editor').elements) if (input.name) input.value = row[input.name];
      message(`Reviewing ${row.name}.`);
    };
    td.append(button); tr.append(td); $('queue').append(tr);
  }
}
async function reload() { records = await (await api('/api/leads')).json(); render(); }
$('filter').onchange = render;
$('minimum').oninput = render;
$('search').oninput = render;
$('due-by').oninput = render;
$('editor').oninput = () => { dirty = true; };
$('new-lead').onclick = () => {
  if (dirty && !confirm('Discard unsaved changes to the current lead?')) return;
  selected = null; dirty = false;
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
      const result = await (await api('/api/create', changes)).json();
      selected = result.id;
    } else {
      await api('/api/update', { id: selected, changes });
    }
    $('editor-title').textContent = 'Review lead';
    dirty = false; await reload(); message('Changes saved to your workspace.');
  } catch (error) { message(error.message); } finally { button.disabled = false; }
};
$('import-form').onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter; button.disabled = true;
  try {
    const file = $('csv').files[0];
    if (!file || file.size > 1000000) throw new Error('Choose a CSV file smaller than 1 MB.');
    const mapping = $('mapping').value.trim() ? JSON.parse($('mapping').value) : {};
    const result = await (await api('/api/import', { csv: await file.text(), mapping })).json();
    await reload(); message(`Imported ${result.added} leads; skipped ${result.duplicates_skipped} duplicates.`);
  } catch (error) { message(error.message); } finally { button.disabled = false; }
};
$('export').onclick = async () => {
  try {
    if (!$('minimum').checkValidity()) throw new Error('Minimum score must be a whole number from 0 to 100.');
    const query = new URLSearchParams({ stage: $('filter').value, minimum: $('minimum').value || '0', search: $('search').value, due_by: $('due-by').value });
    const response = await api('/api/export?' + query);
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
    link.href = url; link.download = 'leads-export.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('CSV exported. Review field mapping before importing into your CRM.');
  } catch (error) { message(error.message); }
};
reload().then(() => message('Workspace ready. Import a CSV to get started.')).catch(error => message(error.message));
