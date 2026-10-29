// Quote builder: permission-gated (admins, plus employees with "Can build quotes").
import { sb, h, icon, btn, toast, modal, confirmDialog, formFields, table, emptyState, statusBadge, fmtMoney, fmtDate, ago, loading } from './core.js';
import { KINDS, lineMath, quoteMath, customerSnapshot } from './quote-calc.js';
import { quoteDocument } from './quote-doc.js';

export const QUOTE_STATUS = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired', superseded: 'Superseded' };
const qTone = { draft: '', sent: 'accent', accepted: 'ok', declined: 'bad', expired: 'warn', superseded: '' };
const money2 = (v) => v === null || v === undefined || isNaN(v) ? '—' : Number(v).toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => v === null || v === undefined || !isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`;
const uid = () => crypto.randomUUID();
const nextRev = (r) => { const s = String(r || 'A').toUpperCase(); if (/^Z+$/.test(s)) return 'A'.repeat(s.length + 1); const a = s.split(''); let i = a.length - 1; while (i >= 0) { if (a[i] !== 'Z') { a[i] = String.fromCharCode(a[i].charCodeAt(0) + 1); break; } a[i] = 'A'; i--; } return a.join(''); };

/* ---------- templates: structure and checklists only. Hours and costs are entered by your team. ---------- */
const L = (section, rate, description) => ({ section, kind: 'labor', rate, description, qty: 0 });
const M = (section, kind, description, unit = 'lot') => ({ section, kind, description, qty: 1, unit });
export const TEMPLATES = {
  blank: { name: 'Blank quote', lines: [] },
  modernization: { name: 'Test stand modernization', lines: [
    L('Assessment', 'Engineering', 'Review existing stand, drawings, test procedure and data'),
    L('Assessment', 'Test', 'Baseline the existing stand (as-found runs)'),
    L('Engineering', 'Engineering', 'Fluid / mechanical design and component sizing'),
    L('Engineering', 'Controls', 'Controls architecture, I/O list and electrical schematics'),
    L('Engineering', 'Design', 'CAD models, panel layout and drawing package'),
    L('Engineering', 'Project', 'Design review with customer'),
    M('Hardware', 'purchased', 'Controller / data acquisition hardware'),
    M('Hardware', 'purchased', 'Transducers, flow meters and sensors'),
    M('Hardware', 'material', 'Electrical panel, wiring and enclosure'),
    M('Hardware', 'material', 'Plumbing, fittings, valves and manifolds'),
    L('Build & integration', 'Technician', 'Panel build and wiring'),
    L('Build & integration', 'Technician', 'Mechanical installation and plumbing on the stand'),
    L('Build & integration', 'Controls', 'Software: test sequences, operator screens, data recording'),
    L('Calibration & test', 'Test', 'Loop checks, commissioning and verification runs'),
    M('Calibration & test', 'subcontract', 'Accredited calibration of measurement instruments (ISO/IEC 17025 lab)'),
    L('Calibration & test', 'Test', 'Factory acceptance test with customer'),
    L('Documentation', 'Documentation', 'Operator manual, maintenance guide and as-built drawings'),
    L('Documentation', 'Documentation', 'Calibration records and test reports'),
    M('Delivery', 'other', 'Crating'),
    { ...M('Delivery', 'travel', 'On-site installation and operator training'), optional: true },
  ] },
  new_stand: { name: 'New test stand / flow bench', lines: [
    L('Engineering', 'Engineering', 'Requirements review (CMM / ATP, media, flows, pressures)'),
    L('Engineering', 'Engineering', 'Fluid circuit design and component sizing'),
    L('Engineering', 'Design', 'Frame, plumbing and panel CAD; drawing package'),
    L('Engineering', 'Controls', 'Controls architecture, I/O list and schematics'),
    L('Engineering', 'Project', 'Design review with customer'),
    M('Mechanical', 'material', 'Frame, structure and enclosures'),
    M('Mechanical', 'purchased', 'Pumps, regulators, reservoirs and filtration'),
    M('Mechanical', 'material', 'Plumbing, fittings, valves and manifolds'),
    L('Mechanical', 'Technician', 'Frame build and mechanical assembly'),
    L('Mechanical', 'Technician', 'Plumbing and leak checks'),
    M('Controls & data', 'purchased', 'Controller / data acquisition hardware'),
    M('Controls & data', 'purchased', 'Transducers, flow meters and sensors'),
    M('Controls & data', 'material', 'Electrical panel, wiring and enclosure'),
    L('Controls & data', 'Technician', 'Panel build and wiring'),
    L('Controls & data', 'Controls', 'Software: test sequences, operator screens, data recording'),
    L('Calibration & test', 'Test', 'Commissioning and verification runs'),
    M('Calibration & test', 'subcontract', 'Accredited calibration of measurement instruments (ISO/IEC 17025 lab)'),
    L('Calibration & test', 'Test', 'Factory acceptance test with customer'),
    L('Documentation', 'Documentation', 'Operator manual, maintenance guide and as-built drawings'),
    L('Documentation', 'Documentation', 'Calibration records and test reports'),
    M('Delivery', 'other', 'Crating'),
    { ...M('Delivery', 'travel', 'On-site installation and operator training'), optional: true },
  ] },
  automation: { name: 'Test automation retrofit (one-button pass/fail)', lines: [
    L('Assessment', 'Engineering', 'Review test procedure, acceptance criteria and current data'),
    L('Engineering', 'Controls', 'Sequence definition, I/O list and schematics'),
    L('Engineering', 'Engineering', 'Map acceptance limits to measured values'),
    M('Hardware', 'purchased', 'Controller / data acquisition hardware'),
    M('Hardware', 'purchased', 'Actuated valves and added sensors (as needed)'),
    M('Hardware', 'material', 'Panel, wiring and operator station'),
    L('Software', 'Controls', 'Automated test sequence logic'),
    L('Software', 'Controls', 'Pass / fail indication, data recording and test report output'),
    L('Integration', 'Technician', 'Install and wire on the existing stand'),
    L('Verification', 'Test', 'Verification runs against the manual procedure'),
    L('Verification', 'Test', 'Factory or site acceptance test'),
    L('Documentation', 'Documentation', 'Operator guide and data / report format description'),
  ] },
  study: { name: 'Engineering study / feasibility', lines: [
    L('Study', 'Engineering', 'Requirements review (CMM / ATP, test media, specifications)'),
    L('Study', 'Engineering', 'Concept options and trade study'),
    L('Study', 'Design', 'Concept layout / CAD'),
    L('Study', 'Project', 'Review meeting with customer'),
    L('Study', 'Documentation', 'Study report with budgetary estimate for the build'),
  ] },
};

export function registerQuotes(views, ctx) {
  const put = (...k) => ui.content.append(...k.filter((x) => x != null && x !== false));
  const { ui, me, isAdmin, q, all, route, staff } = ctx;
  let cache = null;
  async function base() {
    if (cache) return cache;
    const [rates, settings] = await Promise.all([q(sb.from('labor_rates').select('*').order('sort')), q(sb.from('quote_settings').select('*').eq('id', 1).single())]);
    cache = { rates, settings, rateMap: Object.fromEntries(rates.map((r) => [r.id, r])) };
    return cache;
  }
  const flush = () => { cache = null; };

  /* ---------- new quote ---------- */
  async function newQuoteDialog({ companyId = '', dealId = '' } = {}) {
    const [companies, deals, { rates, settings }] = await Promise.all([all('companies', 'id,name', 'name', true), all('deals', 'id,title,company_id,stage'), base()]);
    const comp = h('select', { class: 'input', 'aria-label': 'Company' }, h('option', { value: '' }, 'Choose…'), companies.map((c) => h('option', { value: c.id, selected: c.id === companyId }, c.name)));
    const deal = h('select', { class: 'input', 'aria-label': 'Opportunity' });
    const fillDeals = () => { deal.replaceChildren(h('option', { value: '' }, '— none —'), h('option', { value: '__new' }, '+ New opportunity from this quote'), ...deals.filter((d) => d.company_id === comp.value && !['lost', 'delivered'].includes(d.stage)).map((d) => h('option', { value: d.id, selected: d.id === dealId }, d.title))); if (!dealId && deals.some((d) => d.company_id === comp.value && !['lost', 'delivered'].includes(d.stage))) deal.selectedIndex = 2; };
    comp.addEventListener('change', () => { fillDeals(); syncTitle(); }); fillDeals();
    const tpl = h('select', { class: 'input', 'aria-label': 'Template' }, Object.entries(TEMPLATES).map(([k, t]) => h('option', { value: k }, t.name)));
    const title = h('input', { class: 'input', placeholder: 'e.g. Fuel control unit flow bench modernization' });
    let touched = false; title.addEventListener('input', () => { touched = true; });
    const syncTitle = () => { if (touched) return; const d = deals.find((x) => x.id === deal.value); title.value = d ? d.title : (tpl.value === 'blank' ? '' : TEMPLATES[tpl.value].name); };
    deal.addEventListener('change', syncTitle); tpl.addEventListener('change', syncTitle); syncTitle();
    const noRates = rates.filter((r) => r.active && (r.cost_rate === null || r.bill_rate === null)).length;
    modal({ title: 'New quote', wide: true, body: h('div', { class: 'grid', style: 'gap:1rem' },
      h('div', { class: 'form-grid' }, h('label', { class: 'f' }, 'Company', comp), h('label', { class: 'f' }, 'Opportunity', deal), h('label', { class: 'f' }, 'Start from', tpl), h('label', { class: 'f' }, 'Quote title', title)),
      h('p', { class: 'muted xs', style: 'margin:0' }, 'Templates load the usual sections and line items as a checklist. Enter hours and costs for this job, and delete what doesn’t apply.'),
      noRates ? h('div', { class: 'note warn small' }, icon('key'), ` ${noRates} labor role${noRates > 1 ? 's have' : ' has'} no cost or bill rate yet. `, isAdmin ? h('a', { href: '#/quotes?tab=rates' }, 'Set the rate card') : 'Ask an admin to set the rate card', ' so labor prices calculate.') : null),
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Create quote', onClick: async () => {
        if (!comp.value) { toast('Choose a company.', true); return false; }
        if (!title.value.trim()) { toast('Give the quote a title.', true); return false; }
        let dId = deal.value || null;
        if (dId === '__new') dId = (await q(sb.from('deals').insert({ company_id: comp.value, title: title.value.trim(), stage: 'qualified', owner_id: me.id }).select('id').single())).id;
        const number = await q(sb.rpc('next_quote_number'));
        const valid = new Date(Date.now() + (settings.validity_days || 30) * 864e5).toISOString().slice(0, 10);
        const quote = await q(sb.from('quotes').insert({ number, revision: 'A', company_id: comp.value, deal_id: dId, title: title.value.trim(), valid_until: valid,
          contingency_pct: settings.contingency_pct, milestones: settings.milestones, terms: settings.terms, assumptions: settings.assumptions, exclusions: settings.exclusions }).select('id').single());
        const roleFor = (key) => rates.find((r) => r.active && r.role.toLowerCase().startsWith(key.toLowerCase()))?.id || null;
        const lines = TEMPLATES[tpl.value].lines.map((l, i) => ({ quote_id: quote.id, sort: i, section: l.section, kind: l.kind, description: l.description, qty: l.qty, unit: l.kind === 'labor' ? 'hr' : l.unit, rate_id: l.kind === 'labor' ? roleFor(l.rate) : null, optional: !!l.optional }));
        if (lines.length) await q(sb.from('quote_lines').insert(lines));
        location.hash = `#/quote/${quote.id}`;
      } }] });
  }

  /* ---------- list ---------- */
  views.quotes = async (params) => {
    const tab = params.get('tab') || 'open';
    ui.set('Quotes', { active: 'quotes', actions: [btn('New quote', () => newQuoteDialog(), '', 'plus')] });
    const tabs = h('div', { class: 'subtabs', role: 'tablist' }, [['open', 'Open'], ['accepted', 'Accepted'], ['all', 'All'], ['rates', 'Rate card & defaults']].map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(k === tab), onclick: () => { location.hash = `#/quotes?tab=${k}`; } }, l)));
    put(tabs);
    if (tab === 'rates') return ratesView();
    const [quotes, companies, { rates }] = await Promise.all([all('quotes', '*', 'updated_at'), all('companies', 'id,name', 'name', true), base()]);
    const cname = (id) => companies.find((c) => c.id === id)?.name || '—';
    const rows = quotes.filter((x) => tab === 'all' ? true : tab === 'accepted' ? x.status === 'accepted' : ['draft', 'sent'].includes(x.status));
    const openVal = quotes.filter((x) => x.status === 'sent').reduce((a, x) => a + Number(x.total_price || 0), 0);
    const won = quotes.filter((x) => x.status === 'accepted').reduce((a, x) => a + Number(x.total_price || 0), 0);
    const unset = rates.filter((r) => r.active && (r.cost_rate === null || r.bill_rate === null)).length;
    put(
      unset ? h('div', { class: 'note warn small', style: 'margin-bottom:1rem' }, `${unset} labor role${unset > 1 ? 's are' : ' is'} missing a cost or bill rate, so labor won't price yet. `, h('a', { href: '#/quotes?tab=rates' }, isAdmin ? 'Set rates' : 'View rate card')) : null,
      h('div', { class: 'stats', style: 'margin-bottom:1rem' },
        ...[['Drafts', quotes.filter((x) => x.status === 'draft').length], ['Out for review', fmtMoney(openVal)], ['Accepted', fmtMoney(won)]].map(([l, v]) => h('div', { class: 'stat card' }, h('span', { class: 'xs muted' }, l), h('b', { class: 'tnum' }, String(v))))),
      table([
        { label: 'Quote', render: (x) => h('span', { class: 'mono small', style: 'white-space:nowrap' }, `${x.number} · ${x.revision}`) },
        { label: 'Title', render: (x) => h('div', {}, h('b', {}, x.title), h('div', { class: 'xs muted' }, cname(x.company_id))) },
        { label: 'Status', render: (x) => statusBadge(QUOTE_STATUS, x.status, qTone) },
        { label: 'Total', render: (x) => h('span', { class: 'mono small' }, fmtMoney(x.total_price)) },
        { label: 'Margin', render: (x) => { const m = Number(x.total_price) ? (x.total_price - x.total_cost) / x.total_price : null; return h('span', { class: 'mono small ' + (m === null ? 'muted' : m * 100 < (cache?.settings?.min_margin ?? 0) ? 'tone-bad' : m * 100 < (cache?.settings?.target_margin ?? 0) ? 'tone-warn' : 'tone-ok') }, pct(m)); } },
        { label: 'Valid until', render: (x) => h('span', { class: 'small muted' }, fmtDate(x.valid_until)) },
        { label: 'Updated', render: (x) => h('span', { class: 'small muted' }, ago(x.updated_at)) },
      ], rows, { onRow: (x) => { location.hash = `#/quote/${x.id}`; }, empty: emptyState(tab === 'accepted' ? 'No accepted quotes yet' : 'No quotes yet', 'Start one from a template. The builder calculates cost, price and margin as you go.', btn('New quote', () => newQuoteDialog())) }));
  };

  /* ---------- rate card & defaults ---------- */
  async function ratesView() {
    flush(); const { rates, settings } = await base();
    const ro = !isAdmin;
    const list = rates.map((r) => ({ ...r }));
    const removed = [];
    const tbody = h('tbody');
    const draw = () => {
      tbody.replaceChildren(...list.map((r, i) => {
        const mEl = h('td', { class: 'mono small rc-margin', 'data-label': 'Margin' });
        const upd = () => { mEl.textContent = r.bill_rate && r.cost_rate !== null && r.cost_rate !== '' ? pct((r.bill_rate - r.cost_rate) / r.bill_rate) : '—'; };
        const inp = (k, type = 'number') => { const el = h('input', { class: 'input', type, step: '0.01', min: 0, value: r[k] ?? '', 'aria-label': k.replace('_', ' '), style: type === 'number' ? 'max-width:8rem' : '' }); el.addEventListener('input', () => { r[k] = el.value === '' ? null : type === 'number' ? Number(el.value) : el.value; upd(); }); return el; };
        upd();
        return h('tr', {}, h('td', { class: 'rc-role', 'data-label': 'Role' }, inp('role', 'text')), h('td', { 'data-label': 'Cost / hr' }, inp('cost_rate')), h('td', { 'data-label': 'Bill / hr' }, inp('bill_rate')), mEl,
          h('td', { class: 'rc-active' }, h('label', { class: 'switch xs' }, h('input', { type: 'checkbox', checked: r.active, onchange: (e) => { r.active = e.target.checked; } }), 'Active')),
          h('td', { class: 'actions' }, h('button', { class: 'btn quiet sm', type: 'button', 'aria-label': `Remove ${r.role}`, onclick: () => { if (r.id) removed.push(r.id); list.splice(i, 1); draw(); } }, icon('trash'))));
      }));
    };
    draw();
    const s = { ...settings, markups: { ...settings.markups }, milestones: settings.milestones.map((m) => ({ ...m })) };
    const num = (obj, k, label, suffix = '%') => { const el = h('input', { class: 'input', type: 'number', step: '0.5', min: 0, value: obj[k] ?? '' }); el.addEventListener('input', () => { obj[k] = el.value === '' ? 0 : Number(el.value); }); return h('label', { class: 'f' }, `${label}${suffix ? ` (${suffix})` : ''}`, el); };
    const txt = (k, label) => { const el = h('textarea', { class: 'input', rows: 4 }); el.value = s[k] || ''; el.addEventListener('input', () => { s[k] = el.value; }); return h('label', { class: 'f full' }, label, el); };
    const msBox = h('div', { class: 'grid', style: 'gap:.4rem' });
    const drawMs = () => msBox.replaceChildren(...s.milestones.map((m, i) => h('div', { class: 'row', style: 'gap:.5rem' },
      h('input', { class: 'input grow', value: m.name, 'aria-label': 'Milestone', oninput: (e) => { m.name = e.target.value; } }),
      h('input', { class: 'input', type: 'number', min: 0, max: 100, value: m.pct, style: 'width:6rem', 'aria-label': 'Percent', oninput: (e) => { m.pct = Number(e.target.value || 0); } }), h('span', { class: 'muted small' }, '%'),
      h('button', { class: 'btn quiet sm', type: 'button', 'aria-label': 'Remove milestone', onclick: () => { s.milestones.splice(i, 1); drawMs(); } }, icon('x')))), btn('Add milestone', () => { s.milestones.push({ name: '', pct: 0 }); drawMs(); }, 'quiet sm', 'plus'));
    drawMs();
    const fs = h('fieldset', { disabled: ro, class: 'bare' },
      h('section', { class: 'card' }, h('h2', {}, 'Labor rate card'),
        h('p', { class: 'muted small', style: 'margin-top:0' }, 'Cost rate is your loaded internal cost per hour (wages, burden, overhead). Bill rate is what the customer pays per hour. Margin is calculated from both. Customers never see these.'),
        h('div', { class: 'table-wrap' }, h('table', { class: 't rate-card' }, h('thead', {}, h('tr', {}, h('th', {}, 'Role'), h('th', {}, 'Cost / hr'), h('th', {}, 'Bill / hr'), h('th', {}, 'Margin'), h('th', {}, ''), h('th', {}, ''))), tbody)),
        ro ? null : h('div', { style: 'margin-top:.75rem' }, btn('Add role', () => { list.push({ role: '', cost_rate: null, bill_rate: null, active: true, sort: (list.length + 1) * 10 }); draw(); }, 'quiet sm', 'plus'))),
      h('section', { class: 'card' }, h('h2', {}, 'Pricing defaults'),
        h('div', { class: 'form-grid' }, num(s, 'target_margin', 'Target gross margin'), num(s, 'min_margin', 'Minimum margin (warning below)'), num(s, 'contingency_pct', 'Default contingency'), num(s, 'validity_days', 'Quote valid for', 'days'),
          ...Object.entries(KINDS).filter(([k]) => k !== 'labor').map(([k, l]) => num(s.markups, k, `Markup on ${l.toLowerCase()}`)))),
      h('section', { class: 'card' }, h('h2', {}, 'Default payment milestones'), msBox),
      h('section', { class: 'card' }, h('h2', {}, 'Default text'), h('p', { class: 'muted small', style: 'margin-top:0' }, 'New quotes start with this text. Edit it per quote. One item per line for assumptions and exclusions.'),
        h('div', { class: 'form-grid' }, txt('assumptions', 'Assumptions'), txt('exclusions', 'Exclusions'), txt('terms', 'Terms'))));
    put(ro ? h('div', { class: 'note small', style: 'margin-bottom:1rem' }, 'Only admins can change rates and defaults.') : null, fs,
      ro ? null : h('div', { class: 'toolbar', style: 'margin-top:1rem' }, h('div', { class: 'grow' }), btn('Save rate card & defaults', async () => {
        if (list.some((r) => !String(r.role || '').trim())) return toast('Every role needs a name.', true);
        if (removed.length) await q(sb.from('labor_rates').delete().in('id', removed));
        const up = list.map((r, i) => ({ ...(r.id ? { id: r.id } : {}), role: r.role.trim(), cost_rate: r.cost_rate, bill_rate: r.bill_rate, active: r.active, sort: (i + 1) * 10 }));
        const withId = up.filter((r) => r.id), fresh = up.filter((r) => !r.id);
        if (withId.length) await q(sb.from('labor_rates').upsert(withId));
        if (fresh.length) await q(sb.from('labor_rates').insert(fresh));
        await q(sb.from('quote_settings').update({ target_margin: s.target_margin, min_margin: s.min_margin, contingency_pct: s.contingency_pct, validity_days: s.validity_days, markups: s.markups, milestones: s.milestones.filter((m) => m.name), terms: s.terms, assumptions: s.assumptions, exclusions: s.exclusions, updated_at: new Date().toISOString() }).eq('id', 1));
        flush(); toast('Rate card and defaults saved.'); route();
      })));
  }

  /* ---------- builder ---------- */
  views.quote = async (params, id) => {
    flush();
    const [quote, lines0, { rates, settings, rateMap }] = await Promise.all([q(sb.from('quotes').select('*').eq('id', id).single()), q(sb.from('quote_lines').select('*').eq('quote_id', id).order('sort')), base()]);
    const [company, contacts, deals, revisions, published] = await Promise.all([
      q(sb.from('companies').select('*').eq('id', quote.company_id).single()), q(sb.from('contacts').select('*').eq('company_id', quote.company_id).order('full_name')),
      q(sb.from('deals').select('id,title,stage').eq('company_id', quote.company_id)), q(sb.from('quotes').select('id,revision,status,updated_at').eq('number', quote.number).order('revision')),
      q(sb.from('published_quotes').select('*').eq('quote_id', id).order('created_at', { ascending: false }))]);
    const lines = lines0.map((l) => ({ ...l }));
    const deleted = new Set();
    const ro = quote.status !== 'draft';
    let dirty = false, saving = false, timer = null;
    const saveState = h('span', { class: 'xs muted', 'aria-live': 'polite' }, ro ? 'Read-only' : 'Saved');
    const changed = (structural = false) => { if (ro) return; dirty = true; saveState.textContent = 'Unsaved changes'; clearTimeout(timer); timer = setTimeout(save, 1200); if (structural) drawSections(); drawSummary(); };
    async function save() {
      if (ro || !dirty || saving) return; saving = true; dirty = false; saveState.textContent = 'Saving…';
      try {
        const m = quoteMath(quote, lines, rateMap, settings);
        const { id: _i, number, revision, created_at, created_by, ...fields } = quote;
        await q(sb.from('quotes').update({ ...fields, total_price: m.total, total_cost: m.totalCost, updated_at: new Date().toISOString() }).eq('id', id));
        if (deleted.size) { await q(sb.from('quote_lines').delete().in('id', [...deleted])); deleted.clear(); }
        if (lines.length) await q(sb.from('quote_lines').upsert(lines.map((l, i) => ({ ...l, quote_id: id, sort: i, qty: Number(l.qty) || 0 }))));
        saveState.textContent = 'Saved';
      } catch (e) { dirty = true; saveState.textContent = 'Not saved'; } finally { saving = false; if (dirty) { clearTimeout(timer); timer = setTimeout(save, 1500); } }
    }
    const flushSave = async () => { clearTimeout(timer); if (dirty) await save(); while (saving) await new Promise((r) => setTimeout(r, 100)); };
    window.addEventListener('hashchange', flushSave, { once: true });
    addEventListener('pagehide', flushSave, { once: true });

    ui.set(`${quote.number} · Rev ${quote.revision}`, { active: 'quotes', back: { href: '#/quotes', label: 'Quotes' }, actions: [saveState] });

    /* header */
    const field = (label, el, full) => h('label', { class: 'f' + (full ? ' full' : '') }, label, el);
    const bind = (el, key, conv = (v) => v) => { el.value = quote[key] ?? ''; el.addEventListener('input', () => { quote[key] = el.value === '' ? null : conv(el.value); changed(); }); return el; };
    const numIn = (key, step = '0.01') => bind(h('input', { class: 'input', type: 'number', step, min: 0 }), key, Number);
    const titleIn = bind(h('input', { class: 'input' }), 'title');
    const dealSel = h('select', { class: 'input' }, h('option', { value: '' }, '— none —'), deals.map((d) => h('option', { value: d.id }, d.title))); bind(dealSel, 'deal_id');
    const contactSel = h('select', { class: 'input' }, h('option', { value: '' }, '— none —'), contacts.map((c) => h('option', { value: c.id }, c.full_name))); bind(contactSel, 'contact_id');
    const validIn = bind(h('input', { class: 'input', type: 'date' }), 'valid_until');
    const detailCb = h('input', { type: 'checkbox', checked: quote.show_line_detail, onchange: (e) => { quote.show_line_detail = e.target.checked; changed(); } });
    const header = h('section', { class: 'card' },
      h('div', { class: 'row', style: 'margin-bottom:.75rem' }, h('h2', { class: 'grow', style: 'margin:0' }, h('a', { href: `#/company/${company.id}` }, company.name)), statusBadge(QUOTE_STATUS, quote.status, qTone),
        revisions.length > 1 ? h('select', { class: 'input', style: 'width:auto', 'aria-label': 'Revision', onchange: (e) => { location.hash = `#/quote/${e.target.value}`; } }, revisions.map((r) => h('option', { value: r.id, selected: r.id === id }, `Rev ${r.revision} · ${QUOTE_STATUS[r.status]}`))) : null),
      h('div', { class: 'form-grid' }, field('Title', titleIn, true), field('Opportunity', dealSel), field('Customer contact', contactSel), field('Valid until', validIn),
        h('label', { class: 'switch full' }, detailCb, 'Show line-item detail to the customer (otherwise they see section totals)')));

    /* sections */
    const sectionsEl = h('div', { class: 'grid', style: 'gap:1rem' });
    const rowUpdaters = new Map();
    const sectionNames = () => [...new Set(lines.map((l) => l.section))];
    function lineRow(l) {
      const kindSel = h('select', { class: 'input', 'aria-label': 'Type' }, Object.entries(KINDS).map(([k, v]) => h('option', { value: k, selected: l.kind === k }, v)));
      const desc = h('input', { class: 'input', value: l.description || '', placeholder: 'Description', 'aria-label': 'Description' });
      const roleSel = h('select', { class: 'input', 'aria-label': 'Labor role' }, h('option', { value: '' }, 'Role…'), rates.filter((r) => r.active || r.id === l.rate_id).map((r) => h('option', { value: r.id, selected: r.id === l.rate_id }, r.role)));
      const part = h('input', { class: 'input', value: l.part_number || '', placeholder: 'Part / vendor #', 'aria-label': 'Part number' });
      const qty = h('input', { class: 'input', type: 'number', step: 'any', min: 0, value: l.qty ?? 0, 'aria-label': 'Quantity or hours' });
      const unit = h('input', { class: 'input', value: l.unit || '', placeholder: 'ea', 'aria-label': 'Unit', style: 'max-width:4.5rem' });
      const cost = h('input', { class: 'input', type: 'number', step: '0.01', min: 0, value: l.unit_cost ?? '', placeholder: 'Unit cost', 'aria-label': 'Unit cost' });
      const mk = h('input', { class: 'input', type: 'number', step: '0.5', value: l.markup_pct ?? '', 'aria-label': 'Markup percent' });
      const over = h('input', { class: 'input', type: 'number', step: '0.01', min: 0, value: l.unit_price ?? '', 'aria-label': 'Unit price override' });
      const opt = h('input', { type: 'checkbox', checked: l.optional });
      const total = h('b', { class: 'mono tnum' }); const sub = h('div', { class: 'xs muted mono' }); const flag = h('div', { class: 'xs tone-warn' });
      const show = () => {
        const lab = l.kind === 'labor';
        roleSel.classList.toggle('hidden', !lab); part.classList.toggle('hidden', lab); cost.parentElement?.classList.toggle('hidden', lab); mk.parentElement?.classList.toggle('hidden', lab);
        unit.disabled = lab; if (lab) unit.value = 'hr';
        const rate = rateMap[l.rate_id];
        mk.placeholder = `${settings.markups?.[l.kind] ?? 0} (default)`;
        over.placeholder = lab ? (rate?.bill_rate != null ? `${rate.bill_rate} /hr` : 'Bill rate') : 'Auto';
        const m = lineMath(l, rateMap, settings.markups);
        total.textContent = money2(m.price);
        sub.textContent = `cost ${money2(m.cost)} · ${m.margin === null ? '—' : pct(m.margin)}`;
        flag.textContent = m.flags.join(' · ');
        row.classList.toggle('is-optional', !!l.optional);
      };
      const on = (el, key, conv) => el.addEventListener('input', () => { l[key] = el.value === '' ? null : conv ? conv(el.value) : el.value; show(); changed(); });
      on(desc, 'description'); on(part, 'part_number'); on(qty, 'qty', Number); on(unit, 'unit'); on(cost, 'unit_cost', Number); on(mk, 'markup_pct', Number); on(over, 'unit_price', Number);
      roleSel.addEventListener('change', () => { l.rate_id = roleSel.value || null; show(); changed(); });
      kindSel.addEventListener('change', () => { l.kind = kindSel.value; if (l.kind === 'labor') { l.unit = 'hr'; l.unit_cost = null; l.markup_pct = null; } else if (l.unit === 'hr') { l.unit = 'ea'; unit.value = 'ea'; } show(); changed(); });
      opt.addEventListener('change', () => { l.optional = opt.checked; show(); changed(); });
      const move = (d) => { const i = lines.indexOf(l); const sec = lines.map((x, j) => [x, j]).filter(([x]) => x.section === l.section).map(([, j]) => j); const k = sec.indexOf(i) + d; if (k < 0 || k >= sec.length) return; const j = sec[k]; [lines[i], lines[j]] = [lines[j], lines[i]]; changed(true); };
      const row = h('div', { class: 'ql' },
        h('div', { class: 'ql-a' }, desc, kindSel, roleSel, part),
        h('div', { class: 'ql-b' },
          h('label', { class: 'ql-f' }, h('span', {}, 'Qty / hrs'), qty), h('label', { class: 'ql-f' }, h('span', {}, 'Unit'), unit),
          h('label', { class: 'ql-f' }, h('span', {}, 'Unit cost'), cost),
          h('label', { class: 'ql-f' }, h('span', {}, 'Markup %'), mk),
          h('label', { class: 'ql-f' }, h('span', {}, 'Price / unit'), over),
          h('label', { class: 'switch xs' }, opt, 'Optional'),
          h('div', { class: 'ql-total' }, total, sub),
          h('div', { class: 'ql-act' },
            h('button', { class: 'btn quiet sm', type: 'button', 'aria-label': 'Move up', title: 'Move up', onclick: () => move(-1) }, '↑'),
            h('button', { class: 'btn quiet sm', type: 'button', 'aria-label': 'Move down', title: 'Move down', onclick: () => move(1) }, '↓'),
            h('button', { class: 'btn quiet sm', type: 'button', 'aria-label': 'Duplicate line', title: 'Duplicate', onclick: () => { lines.splice(lines.indexOf(l) + 1, 0, { ...l, id: uid() }); changed(true); } }, '⧉'),
            h('button', { class: 'btn quiet sm', type: 'button', 'aria-label': 'Delete line', title: 'Delete', onclick: () => { if (l.id) deleted.add(l.id); lines.splice(lines.indexOf(l), 1); changed(true); } }, icon('trash')))),
        flag);
      queueMicrotask(show); rowUpdaters.set(l, show);
      return row;
    }
    function drawSections() {
      rowUpdaters.clear();
      const names = sectionNames();
      sectionsEl.replaceChildren(...names.map((name, si) => {
        const secLines = lines.filter((l) => l.section === name);
        const nameIn = h('input', { class: 'input sec-name', value: name, 'aria-label': 'Section name' });
        nameIn.addEventListener('change', () => { const v = nameIn.value.trim() || 'General'; secLines.forEach((l) => { l.section = v; }); changed(true); });
        const totalEl = h('span', { class: 'mono small sec-total', dataset: { sec: name } });
        const addLine = (kind) => { const last = secLines[secLines.length - 1]; const at = last ? lines.indexOf(last) + 1 : lines.length; lines.splice(at, 0, { id: uid(), section: name, kind, description: '', qty: kind === 'labor' ? 0 : 1, unit: kind === 'labor' ? 'hr' : 'ea', optional: false }); changed(true); setTimeout(() => sectionsEl.querySelectorAll(`.qsec`)[si]?.querySelectorAll('.ql')[secLines.length]?.querySelector('input')?.focus(), 30); };
        const moveSec = (d) => { const order = sectionNames(); const j = si + d; if (j < 0 || j >= order.length) return; [order[si], order[j]] = [order[j], order[si]]; const sorted = order.flatMap((n) => lines.filter((l) => l.section === n)); lines.splice(0, lines.length, ...sorted); changed(true); };
        return h('section', { class: 'card qsec' },
          h('div', { class: 'row', style: 'gap:.5rem;margin-bottom:.5rem' }, nameIn, h('div', { class: 'grow' }), totalEl,
            h('button', { class: 'btn quiet sm', type: 'button', 'aria-label': 'Move section up', onclick: () => moveSec(-1) }, '↑'), h('button', { class: 'btn quiet sm', type: 'button', 'aria-label': 'Move section down', onclick: () => moveSec(1) }, '↓'),
            h('button', { class: 'btn quiet sm', type: 'button', 'aria-label': `Delete section ${name}`, onclick: async () => { if (secLines.length && !(await confirmDialog('Delete section?', `"${name}" and its ${secLines.length} line(s) will be removed from this quote.`))) return; secLines.forEach((l) => { if (l.id) deleted.add(l.id); lines.splice(lines.indexOf(l), 1); }); changed(true); } }, icon('trash'))),
          h('div', { class: 'ql-list' }, secLines.map(lineRow)),
          h('div', { class: 'row', style: 'gap:.4rem;margin-top:.6rem;flex-wrap:wrap' }, h('span', { class: 'xs muted' }, 'Add:'),
            ...['labor', 'material', 'purchased', 'subcontract', 'travel', 'other'].map((k) => btn(KINDS[k], () => addLine(k), 'quiet sm', 'plus'))));
      }), ro ? '' : h('div', {}, btn('Add section', () => { let n = 'New section', i = 2; while (sectionNames().includes(n)) n = `New section ${i++}`; lines.push({ id: uid(), section: n, kind: 'labor', description: '', qty: 0, unit: 'hr', optional: false }); changed(true); }, 'ghost', 'plus')));
      if (!names.length) sectionsEl.prepend(h('div', { class: 'card' }, emptyState('No line items yet', 'Add a section, then labor, materials and purchased equipment.')));
      drawSummary();
    }

    /* adjustments + milestones + text */
    const adj = h('section', { class: 'card' }, h('h2', {}, 'Adjustments'),
      h('div', { class: 'form-grid' },
        field('Contingency (%)', numIn('contingency_pct', '0.5')), field('Discount ($)', numIn('discount_amt')), field('Crating & freight ($)', numIn('shipping_amt')), field('Tax (%)', numIn('tax_pct', '0.01'))),
      h('p', { class: 'muted xs', style: 'margin:.5rem 0 0' }, 'Contingency is built into the customer’s prices and never shown as its own line. Suggested: 5% for repeat work, 10% for typical modernization, 15–20% for first-of-a-kind or unclear requirements.'));
    quote.milestones = (quote.milestones || []).map((m) => ({ ...m }));
    const msBox = h('div', { class: 'grid', style: 'gap:.4rem' });
    const drawMs = () => msBox.replaceChildren(...quote.milestones.map((m, i) => h('div', { class: 'row', style: 'gap:.5rem' },
      h('input', { class: 'input grow', value: m.name, 'aria-label': 'Milestone', oninput: (e) => { m.name = e.target.value; changed(); } }),
      h('input', { class: 'input', type: 'number', min: 0, max: 100, value: m.pct, style: 'width:5.5rem', 'aria-label': 'Percent', oninput: (e) => { m.pct = Number(e.target.value || 0); changed(); } }), h('span', { class: 'muted small' }, '%'),
      h('span', { class: 'mono small ms-amt', style: 'min-width:7rem;text-align:right' }),
      h('button', { class: 'btn quiet sm', type: 'button', 'aria-label': 'Remove milestone', onclick: () => { quote.milestones.splice(i, 1); drawMs(); changed(); } }, icon('x')))), btn('Add milestone', () => { quote.milestones.push({ name: '', pct: 0 }); drawMs(); changed(); }, 'quiet sm', 'plus'));
    drawMs();
    const area = (key, label, rows = 4, hint) => { const el = h('textarea', { class: 'input', rows }); bind(el, key); return h('label', { class: 'f full' }, label, hint ? h('span', { class: 'xs muted', style: 'text-transform:none;letter-spacing:0' }, hint) : null, el); };
    const texts = h('section', { class: 'card' }, h('h2', {}, 'Customer-facing text'),
      h('div', { class: 'form-grid' }, area('scope', 'Scope of work', 5, 'What you will deliver, in plain language.'), area('schedule', 'Schedule', 2, 'Optional. Only what you can commit to for this job.'), area('assumptions', 'Assumptions', 4, 'One per line.'), area('exclusions', 'Exclusions', 4, 'One per line.'), area('terms', 'Terms', 3)));

    /* summary */
    const summary = h('aside', { class: 'qsum' });
    function drawSummary() {
      const m = quoteMath(quote, lines, rateMap, settings);
      rowUpdaters.forEach((fn) => fn());
      sectionsEl.querySelectorAll('.sec-total').forEach((el) => { const s = m.sections.find((x) => x.name === el.dataset.sec); el.textContent = s ? money2(s.price) : ''; });
      msBox.querySelectorAll('.ms-amt').forEach((el, i) => { el.textContent = money2(m.milestones[i]?.amount); });
      const target = Number(settings.target_margin), min = Number(settings.min_margin);
      const mp = m.margin === null ? null : m.margin * 100;
      const tone = mp === null ? '' : mp < min ? 'bad' : mp < target ? 'warn' : 'ok';
      const warn = m.warnings;
      summary.replaceChildren(h('div', { class: 'card' },
        h('div', { class: 'xs muted mono', style: 'letter-spacing:.08em;text-transform:uppercase' }, 'Customer total'),
        h('div', { class: 'qsum-total tnum' }, money2(m.total)),
        h('div', { class: 'qsum-margin' }, h('div', { class: 'row' }, h('span', { class: 'small grow' }, 'Gross margin'), h('b', { class: 'tone-' + tone }, pct(m.margin))),
          h('div', { class: 'mbar', role: 'img', 'aria-label': `Margin ${pct(m.margin)}; target ${target}%` }, h('i', { class: 'tone-bg-' + tone, style: `width:${Math.max(0, Math.min(100, mp || 0))}%` }), h('b', { style: `left:${min}%`, title: `Minimum ${min}%` }), h('b', { class: 'tgt', style: `left:${target}%`, title: `Target ${target}%` })),
          h('div', { class: 'xs muted' }, `Target ${target}% · minimum ${min}% · ${pct(m.marginNoCont)} before contingency`)),
        h('dl', { class: 'dl qsum-dl' },
          h('dt', {}, 'Line items'), h('dd', {}, money2(m.subtotal)),
          h('dt', {}, `Contingency ${Number(quote.contingency_pct) || 0}%`), h('dd', {}, money2(m.contingency)),
          m.discount ? [h('dt', {}, 'Discount'), h('dd', {}, '−' + money2(m.discount))] : null,
          m.shipping ? [h('dt', {}, 'Crating & freight'), h('dd', {}, money2(m.shipping))] : null,
          m.tax ? [h('dt', {}, 'Tax'), h('dd', {}, money2(m.tax))] : null,
          h('dt', { class: 'sep' }, 'Your cost'), h('dd', { class: 'sep' }, money2(m.totalCost)),
          h('dt', {}, 'Gross profit'), h('dd', {}, money2(m.total - m.tax - m.totalCost)),
          m.priceAtTarget ? [h('dt', {}, `Price at ${target}% target`), h('dd', {}, money2(m.priceAtTarget))] : null,
          m.optionalTotal ? [h('dt', {}, 'Optional items'), h('dd', {}, money2(m.optionalTotal))] : null),
        h('details', { class: 'qsum-break', open: true }, h('summary', { class: 'small' }, `Cost breakdown · ${+m.hours.toFixed(1)} labor hrs`),
          h('table', { class: 'mini' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Cost'), h('th', {}, 'Price'))), h('tbody', {}, Object.entries(m.byKind).map(([k, v]) => h('tr', {}, h('td', {}, KINDS[k]), h('td', {}, fmtMoney(v.cost)), h('td', {}, fmtMoney(v.price)))))),
          Object.keys(m.hoursByRole).length ? h('div', { class: 'xs muted', style: 'margin-top:.4rem' }, Object.entries(m.hoursByRole).map(([r, hrs]) => `${r}: ${+hrs.toFixed(1)} h`).join(' · ')) : null),
        warn.length ? h('details', { class: 'qsum-warn', open: warn.length <= 6 }, h('summary', { class: 'small' }, `${warn.length} item${warn.length > 1 ? 's' : ''} to check`), h('ul', {}, warn.slice(0, 14).map((w) => h('li', { class: w.level === 'bad' ? 'tone-bad' : '' }, w.text)), warn.length > 14 ? h('li', { class: 'muted' }, `and ${warn.length - 14} more`) : null)) : h('p', { class: 'xs tone-ok', style: 'margin:.75rem 0 0' }, 'Every line has a cost and price.'),
        h('div', { class: 'qsum-actions' },
          btn('Preview', preview, 'ghost', 'eye'),
          !ro ? btn('Send to customer', send, '', 'share') : null,
          btn(ro ? 'New revision to edit' : 'New revision', newRevision, ro ? '' : 'quiet'),
          btn('Duplicate', duplicate, 'quiet'),
          quote.status === 'draft' ? btn('Delete', del, 'quiet') : null,
          quote.status === 'sent' ? btn('Withdraw from portal', withdraw, 'quiet') : null),
        published.length ? h('div', { class: 'xs muted', style: 'margin-top:.75rem' }, published.map((p) => h('div', {}, `Sent ${fmtDate(p.created_at)} · ${p.status === "sent" ? "awaiting customer" : p.status}${p.response_po ? ` · PO ${p.response_po}` : ''}${p.response_name ? ` · ${p.response_name}` : ''}`))) : null));
    }

    async function snapshot() {
      const contact = contacts.find((c) => c.id === quote.contact_id) || null;
      const prep = (await staff()).find((s) => s.id === quote.created_by) || me;
      return customerSnapshot({ quote, lines, rates: rateMap, settings, company, contact, preparer: { ...prep, title: prep.title || (prep.id === me.id ? me.title : null) } });
    }
    async function preview() {
      await flushSave();
      const snap = await snapshot();
      modal({ title: 'Customer view', wide: true, body: h('div', { class: 'qdoc-wrap' }, quoteDocument(snap, { status: quote.status === 'draft' ? 'draft' : quote.status })), actions: [{ label: 'Close', kind: 'ghost' }, { label: 'Open print / PDF view', onClick: () => { window.open(`/quote.html?q=${id}`, '_blank'); return false; } }] });
    }
    async function send() {
      await flushSave();
      const m = quoteMath(quote, lines, rateMap, settings);
      const blockers = m.per.filter((p) => !p.line.optional && (p.flags.includes('Needs a cost') || p.flags.includes('Pick a labor role') || p.flags.some((f) => f.startsWith('No bill rate'))));
      if (!lines.length || !m.total) return toast('Add priced line items before sending.', true);
      const { count: logins } = await sb.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('role', 'customer');
      const lowMargin = m.margin !== null && m.margin * 100 < Number(settings.min_margin);
      modal({ title: 'Send quote to customer', body: h('div', { class: 'grid', style: 'gap:.75rem' },
        h('dl', { class: 'dl' }, h('dt', {}, 'Quote'), h('dd', {}, `${quote.number} Rev ${quote.revision}`), h('dt', {}, 'Total'), h('dd', {}, money2(m.total)), h('dt', {}, 'Valid until'), h('dd', {}, fmtDate(quote.valid_until)), h('dt', {}, 'Margin'), h('dd', {}, pct(m.margin))),
        blockers.length ? h('div', { class: 'note warn small' }, `${blockers.length} line(s) are missing a cost, role or rate and will go out at $0.`) : null,
        lowMargin ? h('div', { class: 'note warn small' }, `Margin is below the ${settings.min_margin}% minimum.`) : null,
        logins ? h('p', { class: 'small', style: 'margin:0' }, `${company.name} will see it in the portal Quotes tab and get a message and notification. They can accept it there (with a PO number), ask for changes, or decline. They see prices only, never cost, rates or margin.`) : h('div', { class: 'note warn small' }, `${company.name} has no portal login yet, so no one can see this quote. Create a login from the company's Portal logins tab.`),
        h('p', { class: 'xs muted', style: 'margin:0' }, 'This revision locks after sending. Make a new revision to change it.')),
        actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Send', onClick: async () => {
          const snap = await snapshot();
          await q(sb.from('published_quotes').update({ status: 'superseded' }).eq('number', quote.number).eq('status', 'sent'));
          await q(sb.from('published_quotes').insert({ quote_id: id, company_id: company.id, number: quote.number, revision: quote.revision, title: quote.title, snapshot: snap, total: snap.total, valid_until: quote.valid_until }));
          await q(sb.from('quotes').update({ status: 'sent', sent_at: new Date().toISOString(), total_price: m.total, total_cost: m.totalCost }).eq('id', id));
          if (quote.deal_id) { const d = deals.find((x) => x.id === quote.deal_id); await q(sb.from('deals').update({ value: m.total, ...(d && ['lead', 'qualified'].includes(d.stage) ? { stage: 'quoted' } : {}), updated_at: new Date().toISOString() }).eq('id', quote.deal_id)); }
          await q(sb.from('messages').insert({ company_id: company.id, body: `Quote ${quote.number} Rev ${quote.revision} is ready for your review: ${quote.title}.\nTotal ${money2(m.total)}${quote.valid_until ? `, valid until ${fmtDate(quote.valid_until)}` : ''}.\nOpen the Quotes tab to review it, accept it with your PO number, or ask for changes.` }));
          toast('Quote sent to the customer portal.'); route();
        } }] });
    }
    async function copyTo({ number, revision, statusOld }) {
      await flushSave();
      const { id: _i, created_at, created_by, sent_at, ...fields } = quote;
      const nq = await q(sb.from('quotes').insert({ ...fields, number, revision, status: 'draft', total_price: null, total_cost: null, updated_at: new Date().toISOString() }).select('id').single());
      if (lines.length) await q(sb.from('quote_lines').insert(lines.map((l, i) => { const { id: _l, quote_id, ...rest } = l; return { ...rest, quote_id: nq.id, sort: i }; })));
      if (statusOld) await q(sb.from('quotes').update({ status: statusOld }).eq('id', id));
      return nq.id;
    }
    async function newRevision() {
      const { data: revs } = await sb.from('quotes').select('revision').eq('number', quote.number);
      let rev = quote.revision; const taken = new Set((revs || []).map((r) => r.revision)); do { rev = nextRev(rev); } while (taken.has(rev));
      const keepOld = ['accepted', 'declined'].includes(quote.status);
      const nid = await copyTo({ number: quote.number, revision: rev, statusOld: keepOld ? null : 'superseded' });
      if (!keepOld) await sb.from('published_quotes').update({ status: 'superseded' }).eq('quote_id', id).eq('status', 'sent');
      toast(`Rev ${rev} created.`); location.hash = `#/quote/${nid}`;
    }
    async function duplicate() { const number = await q(sb.rpc('next_quote_number')); const nid = await copyTo({ number, revision: 'A' }); toast(`Copied to ${number}.`); location.hash = `#/quote/${nid}`; }
    async function del() { if (!(await confirmDialog('Delete this draft?', `${quote.number} Rev ${quote.revision} and its line items will be removed.`))) return; clearTimeout(timer); dirty = false; await q(sb.from('quotes').delete().eq('id', id)); toast('Draft deleted.'); location.hash = '#/quotes'; }
    async function withdraw() { if (!(await confirmDialog('Withdraw quote?', 'It will disappear from the customer portal. You can make a new revision and send it again.', 'Withdraw'))) return; await q(sb.from('published_quotes').update({ status: 'withdrawn' }).eq('quote_id', id).eq('status', 'sent')); await q(sb.from('quotes').update({ status: 'draft' }).eq('id', id)); toast('Withdrawn. This revision is editable again.'); route(); }

    const main = h('fieldset', { class: 'bare qmain', disabled: ro }, header, sectionsEl, adj, h('section', { class: 'card' }, h('h2', {}, 'Payment milestones'), msBox), texts);
    put(
      ro ? h('div', { class: 'note small', style: 'margin-bottom:1rem' }, `This revision is ${QUOTE_STATUS[quote.status].toLowerCase()} and locked. Use “New revision” to make changes.`) : null,
      h('div', { class: 'qgrid' }, main, summary));
    drawSections();
  };

  /* ---------- small helpers for other screens ---------- */
  async function quotesFor(filter) {
    let qq = sb.from('quotes').select('id,number,revision,title,status,total_price,updated_at').order('updated_at', { ascending: false });
    for (const [k, v] of Object.entries(filter)) qq = qq.eq(k, v);
    const { data } = await qq; return data || [];
  }
  function quoteListEl(list) {
    return list.length ? h('div', { class: 'list' }, list.map((x) => h('a', { class: 'row small', href: `#/quote/${x.id}`, style: 'color:inherit;text-decoration:none' }, h('span', { class: 'mono xs' }, `${x.number}·${x.revision}`), h('span', { class: 'grow ellipsis' }, x.title), statusBadge(QUOTE_STATUS, x.status, qTone), h('span', { class: 'mono xs' }, fmtMoney(x.total_price))))) : h('p', { class: 'muted xs', style: 'margin:0' }, 'No quotes yet.');
  }
  /** Section for the opportunity dialog */
  function dealQuotes(deal) {
    const box = h('section', { class: 'ef' }, h('div', { class: 'row' }, h('b', { class: 'small grow' }, 'Quotes'), btn('New quote', () => { document.querySelector('.overlay')?.remove(); newQuoteDialog({ companyId: deal.company_id, dealId: deal.id }); }, 'quiet sm', 'plus')), h('div', { class: 'xs muted' }, 'Loading…'));
    quotesFor({ deal_id: deal.id }).then((l) => box.lastChild.replaceWith(quoteListEl(l)));
    return box;
  }
  async function companyQuotesTab(companyId) {
    const list = await quotesFor({ company_id: companyId });
    return h('div', {}, h('div', { class: 'toolbar' }, h('span', { class: 'muted small' }, 'Quotes for this company. Sent quotes appear in their portal.'), h('div', { class: 'grow' }), btn('New quote', () => newQuoteDialog({ companyId }), '', 'plus')),
      h('div', { class: 'card' }, quoteListEl(list)));
  }
  return { newQuoteDialog, dealQuotes, companyQuotesTab };
}
