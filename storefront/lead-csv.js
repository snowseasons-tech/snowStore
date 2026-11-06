/* CSV exchange helpers shared by the hosted pilot UI and tests. */
(function (root) {
  'use strict';
  const fields = ['name', 'email', 'website', 'phone', 'stage', 'fit', 'intent', 'budget', 'notes', 'follow_up'];
  function parse(text, mapping = {}) {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || Object.keys(mapping).some(key => !fields.includes(key)) || Object.values(mapping).some(value => typeof value !== 'string')) throw new Error('Mapping must map supported lead fields to CSV column names.');
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], field = '', quoted = false, closed = false;
    const cell = () => { row.push(field); field = ''; closed = false; };
    const line = () => { cell(); if (row.some(value => value !== '')) rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') { quoted = false; closed = true; }
        else field += ch;
      } else if (ch === ',') cell();
      else if (ch === '\n' || ch === '\r') { line(); if (ch === '\r' && text[i + 1] === '\n') i++; }
      else if (ch === '"' && !field && !closed) quoted = true;
      else { if (closed || ch === '"') throw new Error('Malformed CSV quoting.'); field += ch; }
    }
    if (quoted) throw new Error('CSV has an unclosed quoted field.');
    if (field || row.length || closed) line();
    const headers = rows.shift() || [];
    if (new Set(headers).size !== headers.length) throw new Error('CSV has duplicate headers.');
    if (!headers.includes(mapping.name || 'name')) throw new Error('CSV requires a name column or mapping.');
    if (Object.values(mapping).some(column => !headers.includes(column))) throw new Error('A mapped CSV column is missing.');
    if (!rows.length || rows.length > 200) throw new Error('Import between 1 and 200 leads.');
    return rows.map((values, index) => {
      if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has an unexpected column count.`);
      return Object.fromEntries(fields.map(key => [key, values[headers.indexOf(mapping[key] || key)] || '']));
    });
  }
  function stringify(rows) {
    const columns = ['id', ...fields, 'score', 'updated_at'];
    const cell = value => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return columns.map(cell).join(',') + '\r\n' + rows.map(row => columns.map(key => cell(row[key])).join(',')).join('\r\n');
  }
  const api = { parse, stringify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.leadCsv = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
