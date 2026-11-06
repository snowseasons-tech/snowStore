/* In-memory responses for the real MailHub UI. No network or browser storage. */
const mailhubDemo = (() => {
  const copy = value => structuredClone(value);
  const cleanTags = tags => [...new Set(tags.map(t => String(t).trim().toLowerCase().slice(0, 60)).filter(Boolean))].sort();
  const email = value => {
    const result = String(value || '').trim().toLowerCase();
    if (result.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw Error('Enter a valid email address.');
    return result;
  };
  const text = (value, label, max = 200) => {
    const result = String(value || '').trim();
    if (!result || result.length > max) throw Error(`${label} is required (up to ${max} characters).`);
    return result;
  };
  let state;
  function reset() {
    state = {
      next: 10, used: 120, limit: 1000,
      lists: [{id: 'l1', name: 'Newsletter'}, {id: 'l2', name: 'Customers'}],
      contacts: [
        {id: 'p1', email: 'alex@example.com', first_name: 'Alex', last_name: 'Demo', tags: ['newsletter', 'vip'], lists: ['l1', 'l2']},
        {id: 'p2', email: 'sam@example.com', first_name: 'Sam', last_name: 'Sample', tags: ['newsletter'], lists: ['l1']},
        {id: 'p3', email: 'jordan@example.com', first_name: 'Jordan', last_name: 'Example', tags: ['vip'], lists: ['l2']},
        {id: 'p4', email: 'taylor@example.com', first_name: 'Taylor', last_name: 'Demo', tags: ['newsletter', 'vip'], lists: ['l1']},
        {id: 'p5', email: 'morgan@example.com', first_name: 'Morgan', last_name: 'Sample', tags: ['newsletter'], lists: ['l1']},
        {id: 'p6', email: 'reader@example.com', first_name: '', last_name: '', tags: ['newsletter'], lists: ['l1']},
      ],
      segments: [{id: 's1', name: 'VIP readers', tags: ['newsletter', 'vip'], match: 'all'}],
      suppressions: [{email: 'taylor@example.com', reason: 'unsubscribed'}],
      campaigns: [
        {id: 'c1', name: 'Workshop update', subject: 'This month at Example Studio, {{first_name|there}}', body_html: '<h1>A new season of workshops</h1><p>Hi {{first_name|there}},</p><p>Our fictional workshop schedule is ready. Reply if you would like to learn more.</p><p>The Example Studio team</p>', list_id: 'l1', segment_id: null, status: 'draft', last_error: '', send_at: null},
        {id: 'c2', name: 'Previous sample newsletter', subject: 'Your monthly studio update', body_html: '<h1>Example Studio newsletter</h1><p>A fictional past campaign used to demonstrate the report screen.</p>', list_id: 'l1', segment_id: null, status: 'sent', last_error: '', send_at: null, historical: true},
        {id: 'c3', name: 'Paused customer update', subject: 'A note for our customers', body_html: '<p>Hello {{first_name|there}},</p><p>This is a sample paused campaign.</p>', list_id: 'l2', segment_id: null, status: 'paused', last_error: 'Sample campaign paused for review.', send_at: null, recipients: [{email: 'alex@example.com', status: 'pending'}, {email: 'jordan@example.com', status: 'pending'}]},
      ],
      settings: {from_name: 'Example Studio', from_email: 'news@example.com', reply_to: '', postal_address: '123 Main St, Springfield', domain: 'example.com', domain_status: 'verified', domain_records: [], has_resend_key: true, key_from_server: true, has_webhook_secret: true, webhook_url: 'https://example.com/api/webhooks/resend', webhook_last_at: null},
    };
  }
  const id = prefix => prefix + state.next++;
  const need = (items, key, label) => {
    const item = items.find(item => item.id === key);
    if (!item) throw Error(label + ' not found.');
    return item;
  };
  const suppressed = address => state.suppressions.some(s => s.email === address);
  const contactView = c => ({...c, suppressed: suppressed(c.email), consent_source: 'Fictional demo data'});
  function audience(campaign) {
    const segment = campaign.segment_id ? need(state.segments, campaign.segment_id, 'Segment') : null;
    return state.contacts.filter(c => !suppressed(c.email)
      && (!campaign.list_id || c.lists.includes(campaign.list_id))
      && (!segment || (segment.match === 'all' ? segment.tags.every(t => c.tags.includes(t)) : segment.tags.some(t => c.tags.includes(t)))))
      .sort((a, b) => a.email.localeCompare(b.email));
  }
  function readiness() {
    const s = state.settings, problems = [];
    if (s.domain_status !== 'verified') problems.push('Verify your sample sending domain.');
    if (!s.from_email || s.from_email.split('@')[1] !== s.domain) problems.push('Use a From address on the sample sending domain.');
    if (!s.postal_address.trim()) problems.push('Add a sample postal address.');
    return problems;
  }
  function ready() {
    const problems = readiness();
    if (problems.length) throw Error(problems.join(' '));
  }
  const settingsView = () => ({...state.settings, not_ready: readiness()});
  function editable(campaign) {
    if (campaign.status !== 'draft') throw Error('Only drafts can be changed.');
    return campaign;
  }
  function campaignData(data) {
    if (!data.list_id && !data.segment_id) throw Error('Choose a list or a segment.');
    if (data.list_id) need(state.lists, data.list_id, 'List');
    if (data.segment_id) need(state.segments, data.segment_id, 'Segment');
    return {name: text(data.name, 'Campaign name'), subject: text(data.subject, 'Subject', 250), body_html: text(data.body_html, 'Email body', 1000000), list_id: data.list_id || null, segment_id: data.segment_id || null};
  }
  function csvRows(source) {
    const rows = []; let row = [], cell = '', quoted = false;
    source = source.replace(/^\uFEFF/, '');
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (c === '"') {
        if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && source[i + 1] === '\n') i++;
        row.push(cell); if (row.some(value => value.trim())) rows.push(row);
        row = []; cell = '';
      } else cell += c;
    }
    if (quoted) throw Error('The CSV contains an unclosed quoted field.');
    row.push(cell); if (row.some(value => value.trim())) rows.push(row);
    return rows;
  }
  async function importCsv(listId, form) {
    need(state.lists, listId, 'List');
    if (form.get('consent') !== 'true') throw Error('Confirm these people agreed to get email from you.');
    const file = form.get('file');
    if (!file || typeof file.text !== 'function') throw Error('Choose a CSV file.');
    if (file.size > 20 * 1024 * 1024) throw Error('That file is over 20 MB.');
    const rows = csvRows(await file.text());
    const headers = (rows.shift() || []).map(h => h.trim().toLowerCase().replace(/ /g, '_'));
    if (!headers.includes('email')) throw Error('The file needs an "email" column.');
    const unique = new Map(); let invalid = 0;
    for (const row of rows) {
      const get = name => (row[headers.indexOf(name)] || '').trim();
      try { unique.set(email(get('email')), {first_name: get('first_name').slice(0, 200), last_name: get('last_name').slice(0, 200), tags: cleanTags(get('tags').split(/[;,|]/))}); }
      catch { invalid++; }
    }
    let added = 0, updated = 0, blocked = 0;
    for (const [address, data] of unique) {
      let c = state.contacts.find(c => c.email === address);
      if (c) {
        updated++;
        c.first_name = data.first_name || c.first_name;
        c.last_name = data.last_name || c.last_name;
        c.tags = cleanTags([...c.tags, ...data.tags]);
      } else {
        c = {id: id('p'), email: address, ...data, lists: []};
        state.contacts.push(c); added++;
      }
      if (!c.lists.includes(listId)) c.lists.push(listId);
      if (suppressed(address)) blocked++;
    }
    return {added, updated, invalid, suppressed: blocked};
  }
  function report(c) {
    if (c.historical) return {recipients: 120, sent: 120, delivered: 118, opened: 42, opens_total: 57, open_rate: 35, clicked: 12, clicks_total: 18, click_rate: 10, unsubscribed: 2, bounced: 2, complained: 0, failed: 0, links: [{url: 'https://example.com/workshops', clicks: 18}]};
    const people = c.recipients || [], count = status => people.filter(p => p.status === status).length;
    return {recipients: people.length, sent: count('sent'), pending: count('pending'), skipped: count('skipped'), canceled: count('canceled'), delivered: 0, opened: 0, opens_total: 0, open_rate: 0, clicked: 0, clicks_total: 0, click_rate: 0, unsubscribed: 0, bounced: 0, complained: 0, failed: 0, links: []};
  }
  async function handle(path, options = {}) {
    const url = new URL(path, 'https://example.com'), parts = url.pathname.split('/').filter(Boolean);
    const method = options.method || 'GET';
    const data = typeof options.body === 'string' ? JSON.parse(options.body) : {};
    const [resource, key, action] = parts;
    if (resource === 'me' && method === 'GET') return {email: 'demo@example.com'};
    if (resource === 'plan' && method === 'GET') return {used: state.used, limit: state.limit};
    if (resource === 'lists') {
      if (!key && method === 'GET') return state.lists.map(l => ({...l, contacts: state.contacts.filter(c => c.lists.includes(l.id)).length}));
      if (!key && method === 'POST') {
        const name = text(data.name, 'List name');
        if (state.lists.some(l => l.name === name)) throw Error('A list with this name already exists.');
        const l = {id: id('l'), name}; state.lists.push(l); return {...l, contacts: 0};
      }
      if (action === 'import' && method === 'POST') return importCsv(key, options.body);
      if (key && method === 'DELETE') {
        need(state.lists, key, 'List'); state.lists = state.lists.filter(l => l.id !== key);
        for (const c of state.contacts) c.lists = c.lists.filter(l => l !== key);
        for (const c of state.campaigns) if (c.list_id === key) c.list_id = null;
        return {ok: true};
      }
    }
    if (resource === 'contacts') {
      if (!key && method === 'GET') {
        const list = state.contacts.filter(c => c.email.includes((url.searchParams.get('q') || '').toLowerCase()));
        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
        return {total: list.length, contacts: list.slice(offset, offset + 100).map(contactView)};
      }
      if (!key && method === 'POST') {
        const address = email(data.email);
        if (state.contacts.some(c => c.email === address)) throw Error('Email already exists.');
        if (data.list_id) need(state.lists, data.list_id, 'List');
        const c = {id: id('p'), email: address, first_name: String(data.first_name || '').slice(0, 200), last_name: String(data.last_name || '').slice(0, 200), tags: cleanTags(data.tags || []), lists: data.list_id ? [data.list_id] : []};
        state.contacts.push(c); return contactView(c);
      }
      if (key && action === 'tags' && method === 'PUT') { const c = need(state.contacts, key, 'Contact'); c.tags = cleanTags(data.tags || []); return contactView(c); }
      if (key && method === 'DELETE') { need(state.contacts, key, 'Contact'); state.contacts = state.contacts.filter(c => c.id !== key); return {ok: true}; }
    }
    if (resource === 'tags' && method === 'GET') return cleanTags(state.contacts.flatMap(c => c.tags)).map(tag => ({tag, contacts: state.contacts.filter(c => c.tags.includes(tag)).length}));
    if (resource === 'segments') {
      if (!key && method === 'GET') return state.segments;
      if (!key && method === 'POST') {
        const tags = cleanTags(data.tags || []), name = text(data.name, 'Segment name');
        if (!tags.length) throw Error('Choose at least one tag.');
        if (!['any', 'all'].includes(data.match)) throw Error('Choose any or all matching.');
        const s = {id: id('s'), name, tags, match: data.match}; state.segments.push(s); return s;
      }
      if (key && method === 'DELETE') {
        need(state.segments, key, 'Segment'); state.segments = state.segments.filter(s => s.id !== key);
        for (const c of state.campaigns) if (c.segment_id === key) c.segment_id = null;
        return {ok: true};
      }
    }
    if (resource === 'suppressions') {
      if (method === 'GET') return state.suppressions;
      if (method === 'POST') { const address = email(data.email); if (!suppressed(address)) state.suppressions.push({email: address, reason: 'manual'}); return {ok: true}; }
    }
    if (resource === 'settings') {
      if (method === 'GET') return settingsView();
      if (method === 'PUT') {
        if ('resend_api_key' in data || 'webhook_secret' in data) throw Error('Credentials are not accepted by this demo.');
        if (data.from_email) email(data.from_email);
        if (data.reply_to) email(data.reply_to);
        for (const field of ['from_name', 'from_email', 'reply_to', 'postal_address']) if (field in data) state.settings[field] = String(data[field] || '');
        return settingsView();
      }
    }
    if (resource === 'domain' && method === 'POST') {
      if (key === 'check') { state.settings.domain_status = 'verified'; state.settings.domain_records.forEach(r => r.status = 'verified'); }
      else {
        const domain = String(data.domain || '').toLowerCase();
        if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain)) throw Error('Enter a sample domain such as example.com.');
        state.settings.domain = domain; state.settings.domain_status = 'pending';
        state.settings.domain_records = [{type: 'TXT', name: '_demo.' + domain, value: 'DEMO_RECORD_ONLY_DO_NOT_INSTALL', status: 'pending'}];
      }
      return settingsView();
    }
    if (resource === 'campaigns') {
      if (!key && method === 'GET') return [...state.campaigns].reverse();
      if (!key && method === 'POST') {
        const c = {id: id('c'), ...campaignData(data), status: 'draft', last_error: '', send_at: null}; state.campaigns.push(c); return c;
      }
      const c = need(state.campaigns, key, 'Campaign');
      if (!action && method === 'PUT') { editable(c); Object.assign(c, campaignData(data)); return c; }
      if (!action && method === 'DELETE') { editable(c); state.campaigns = state.campaigns.filter(c => c.id !== key); return {ok: true}; }
      if (action === 'audience' && method === 'GET') return {recipients: audience(c).length};
      if (action === 'stats' && method === 'GET') return report(c);
      if (action === 'test' && method === 'POST') {
        ready(); email(data.email);
        if (state.used >= state.limit) throw Error('The sample monthly send limit is used up.');
        state.used++; return {ok: true, simulated: true};
      }
      if (action === 'send' && method === 'POST') {
        editable(c); ready(); const people = audience(c);
        if (!people.length) throw Error('This campaign has no one to send to.');
        if (data.send_at && (!Number.isFinite(Date.parse(data.send_at)) || Date.parse(data.send_at) <= Date.now())) throw Error('Schedule in the future.');
        const reserved = state.campaigns.filter(c => ['queued', 'sending', 'paused'].includes(c.status)).reduce((sum, c) => sum + (c.recipients || []).filter(p => p.status === 'pending').length, 0);
        if (people.length > Math.max(0, state.limit - state.used - reserved)) throw Error('This campaign exceeds the remaining sample send allowance.');
        c.recipients = people.map(p => ({email: p.email, status: 'pending'})); c.status = 'queued'; c.send_at = data.send_at || null; return {...c, recipients: people.length};
      }
      if (action === 'resume' && method === 'POST') {
        if (c.status !== 'paused') throw Error('Only paused campaigns can resume.');
        if (state.used >= state.limit) throw Error('The sample monthly send limit is used up.');
        c.status = 'queued'; c.last_error = ''; return c;
      }
      if (action === 'cancel' && method === 'POST') {
        if (!['queued', 'sending', 'paused'].includes(c.status)) throw Error('This campaign is not sending.');
        c.status = 'canceled'; for (const p of c.recipients || []) if (p.status === 'pending') p.status = 'canceled'; return c;
      }
    }
    throw Error('This action is not available in the offline MailHub demo.');
  }
  function runWorker() {
    let completed = 0;
    ready();
    for (const c of state.campaigns.filter(c => c.status === 'queued' && (!c.send_at || Date.parse(c.send_at) <= Date.now()))) {
      for (const person of c.recipients || []) {
        if (person.status !== 'pending') continue;
        if (suppressed(person.email)) person.status = 'skipped';
        else if (state.used < state.limit) { person.status = 'sent'; state.used++; }
        else { c.status = 'paused'; c.last_error = 'Sample monthly send allowance used up.'; break; }
      }
      if (c.status !== 'paused') { c.status = 'sent'; completed++; }
    }
    return completed;
  }
  reset();
  return {request: async (path, options) => copy(await handle(path, options)), reset, runWorker, inspect: () => copy(state)};
})();

function demoEmailPreview(body) {
  const template = document.createElement('template');
  template.innerHTML = String(body);
  template.content.querySelectorAll('script,style,iframe,object,embed,link,meta,base,img,svg,math,form,input,button,textarea,select').forEach(e => e.remove());
  for (const e of template.content.querySelectorAll('*')) for (const attribute of [...e.attributes]) e.removeAttribute(attribute.name);
  const safe = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const values = {first_name: 'Alex', last_name: 'Demo', email: 'alex@example.com', unsubscribe_url: '#'};
  const merged = template.innerHTML.replace(/\{\{\s*(\w+)\s*(?:\|([^}]*))?\}\}/g, (match, name, fallback) => name.toLowerCase() in values ? safe(values[name.toLowerCase()] || (fallback || '').trim()) : match);
  const settings = mailhubDemo.inspect().settings;
  return '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; form-action \'none\'; base-uri \'none\'"><style>body{font:16px/1.6 system-ui,sans-serif;padding:24px;color:#172536;overflow-wrap:anywhere}footer{margin-top:32px;border-top:1px solid #ddd;padding-top:14px;font-size:12px;color:#536477}</style>' + merged + '<footer>' + safe(settings.from_name) + ' · ' + safe(settings.postal_address) + '<br>Unsubscribe · inert demo footer</footer>';
}
