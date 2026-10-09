// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
const token = document.querySelector('meta[name="catalog-token"]').content;
let data = { items: [], requests: [], engineIds: [] };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function showView(name) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === name + '-view'));
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === name));
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
async function load() {
  const response = await fetch('/api/data', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load the catalog. Reload the desk.');
  data = await response.json();
  document.getElementById('notice').textContent = data.sourceMessage || '';
  document.getElementById('actor').textContent = 'Submitting as ' + data.actor;
  renderGallery();
  renderLedger();
}
function renderGallery() {
  const groups = Object.groupBy(data.items, item => item.category);
  document.getElementById('gallery').innerHTML = Object.entries(groups).map(([category, items]) =>
    '<section class="category"><h2>' + esc(category) + '</h2><div class="gallery">' + items.map(item =>
      '<button class="item-card" data-id="' + esc(item.id) + '"><span class="meta">' + esc(item.id) + '</span><h3>' + esc(item.name) +
      '</h3><span>' + esc(item.short_description) + '</span><span class="destination">→ ' + esc(item.destination) + '</span></button>'
    ).join('') + '</div></section>').join('') || '<div class="empty">No catalog items configured</div>';
  document.querySelectorAll('.item-card').forEach(button => button.addEventListener('click', () => openItem(button.dataset.id)));
}
function inputFor(variable) {
  const v = variable, value = v.default ?? '';
  const attrs = ' id="field-' + esc(v.name) + '" name="' + esc(v.name) + '"' + (v.mandatory && v.type !== 'boolean' ? ' required' : '');
  if (v.type === 'text') return '<textarea' + attrs + '>' + esc(value) + '</textarea>';
  if (v.type === 'choice' || v.type === 'reference') {
    const choices = v.type === 'reference' ? data.engineIds.map(id => ({ value: id, label: id })) : v.choices;
    return '<select' + attrs + '><option value="">Choose…</option>' + choices.map(choice => '<option value="' + esc(choice.value) + '"' +
      (String(choice.value) === String(value) ? ' selected' : '') + '>' + esc(choice.label) + '</option>').join('') + '</select>';
  }
  if (v.type === 'boolean') return '<div class="boolean"><input' + attrs + ' type="checkbox"' + (value === true ? ' checked' : '') + '> Yes</div>';
  return '<input' + attrs + ' type="' + (v.type === 'date' ? 'date' : 'text') + '" value="' + esc(value) + '">';
}
function openItem(id) {
  const item = data.items.find(candidate => candidate.id === id);
  if (!item) return;
  const fields = item.variables.map(v => '<div class="field ' + (v.type === 'text' ? 'text' : '') + '" data-variable="' + esc(v.name) + '"><label for="field-' +
    esc(v.name) + '">' + esc(v.label) + (v.mandatory ? ' <span class="mandatory">*</span>' : '') + '</label>' + inputFor(v) +
    (v.help ? '<div class="help">' + esc(v.help) + '</div>' : '') + '</div>').join('');
  document.getElementById('form-root').innerHTML = '<div class="form-card"><button class="back" type="button">← Catalog</button><div class="meta">' +
    esc(item.category) + ' · ' + esc(item.destination) + '</div><h1>' + esc(item.name) + '</h1><div class="sub">' + esc(item.short_description) +
    '</div><form id="item-form" data-item="' + esc(item.id) + '"><div class="form-grid">' + fields +
    '</div><button class="submit">Submit request</button></form><div id="result" aria-live="polite"></div></div>';
  document.querySelector('.back').addEventListener('click', () => showView('catalog'));
  const form = document.getElementById('item-form');
  function visibility() {
    for (const variable of item.variables) {
      if (!variable.visibleIf) continue;
      const source = form.elements.namedItem(variable.visibleIf.variable);
      const current = source?.type === 'checkbox' ? String(source.checked) : String(source?.value ?? '');
      const visible = current === String(variable.visibleIf.equals ?? '');
      const field = [...form.querySelectorAll('[data-variable]')].find(el => el.dataset.variable === variable.name);
      field.classList.toggle('hidden', !visible);
      field.querySelectorAll('input,select,textarea').forEach(control => {
        control.disabled = !visible; control.required = visible && variable.mandatory && variable.type !== 'boolean';
      });
    }
  }
  form.addEventListener('input', visibility);
  form.addEventListener('change', visibility);
  form.addEventListener('submit', submitItem);
  visibility(); showView('form');
}
async function submitItem(event) {
  event.preventDefault();
  const form = event.target, button = form.querySelector('.submit'), root = document.getElementById('result');
  if (button.disabled) return;
  button.disabled = true;
  const variables = Object.fromEntries(new FormData(form));
  form.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(control => { variables[control.name] = control.checked; });
  try {
    const response = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Catalog-Token': token },
      body: JSON.stringify({ itemId: form.dataset.item, variables }) });
    const row = await response.json();
    if (!response.ok) throw new Error(row.error || 'Request rejected');
    root.innerHTML = '<div class="result ' + (row.state === 'fulfilled' ? 'good' : 'bad') + '"><h3>' + esc(row.number) + ' ' + esc(row.state) +
      '</h3>' + (row.created_ref ? 'Created <span class="mono">' + esc(row.created_ref) + '</span>' : '<p>The request is preserved for inspection.</p><pre>' +
        esc(row.producer_output || 'No producer output') + '</pre>') + '</div>';
    // Keep a completed form disabled to avoid accidental duplicate submissions.
    await load();
  } catch (error) {
    root.textContent = error.message + ' If the connection failed, check Requests before submitting again.';
    button.disabled = false;
  }
}
function renderLedger() {
  const root = document.getElementById('ledger');
  root.innerHTML = '<div class="ledger"><table><thead><tr><th>Request</th><th>Item</th><th>State</th><th>Destination record</th><th>Submitted</th></tr></thead><tbody>' +
    data.requests.map(row => '<tr><td><button class="request-link" data-number="' + esc(row.number) + '">' + esc(row.number) + '</button></td><td><b>' +
      esc(row.item_id) + '</b><br><span class="meta">' + esc(row.submitted_by) + '</span></td><td><span class="chip ' + esc(row.state) + '">' +
      esc(row.state) + '</span>' + (row.state === 'failed' ? '<details><summary>Output</summary><pre>' + esc(row.producer_output || 'No output') + '</pre></details>' : '') +
      '</td><td class="mono">' + esc(row.created_ref || '—') + '</td><td>' + esc(row.submitted_at.slice(0, 16).replace('T', ' ')) + '</td></tr>').join('') +
    '</tbody></table></div><div id="request-detail" aria-live="polite"></div>';
  if (!data.requests.length) root.textContent = 'No requests yet';
  root.querySelectorAll('.request-link').forEach(button => button.addEventListener('click', async () => {
    const detail = document.getElementById('request-detail');
    try {
      const response = await fetch('/api/request?number=' + encodeURIComponent(button.dataset.number));
      const row = await response.json();
      if (!response.ok) throw new Error(row.error);
      detail.innerHTML = '<div class="result"><h3>' + esc(row.number) + '</h3><pre>' +
        esc(JSON.stringify({ variables: row.variables, events: row.events, stamp: row.stamp }, null, 2)) + '</pre></div>';
    } catch (error) { detail.textContent = error.message; }
  }));
}
const report = error => { document.getElementById('notice').textContent = error.message; };
load().catch(report);
setInterval(() => load().catch(report), 30000);
