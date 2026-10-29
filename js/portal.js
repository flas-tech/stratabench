import { sb, h, icon, requireRole, shell, passwordDialog, fmtDate, ago, PROJECT_STATUS, statusBadge, emptyState, loading, btn, toast, fileKind, openDoc } from './core.js';
import { docLibrary, uploadDialog } from './docs.js';
import { threadView, unreadSummary } from './thread.js';
import { quoteDocument } from './quote-doc.js';
import { modal, fmtMoney } from './core.js';

const profile = await requireRole(['customer']);
const ui = shell({ profile, subtitle: 'Project portal', items: [
  { id: 'overview', label: 'Overview', icon: 'dash' },
  { id: 'documents', label: 'Documents', icon: 'folder' },
  { id: 'quotes', label: 'Quotes', icon: 'file', count: true },
  { id: 'messages', label: 'Messages', icon: 'msg', count: true },
] });
if (profile.must_change_password) await passwordDialog(profile, true);

const state = { company: null, projects: [], docs: [], messages: [], names: {}, quotes: [] };
async function load() {
  const [c, p, d, m, pq] = await Promise.all([
    sb.rpc('my_company_info'),
    sb.from('projects').select('*').order('created_at', { ascending: false }),
    sb.from('documents').select('*').order('created_at', { ascending: false }),
    sb.from('messages').select('*').order('created_at', { ascending: true }),
    sb.from('published_quotes').select('*').order('created_at', { ascending: false }),
  ]);
  state.company = c.data?.[0] || null;
  state.quotes = pq.data || []; ui.count('quotes', state.quotes.filter((x) => x.status === 'sent').length);
  state.projects = p.data || []; state.docs = d.data || []; state.messages = m.data || [];
  const ids = [...new Set(state.messages.map((x) => x.author_id).filter((x) => x && !state.names[x]))];
  await Promise.all(ids.map(async (id) => { const { data } = await sb.rpc('author_name', { uid: id }); state.names[id] = data || 'Stratabench'; }));
}

const STEPS = ['study', 'design', 'build', 'test', 'delivered'];
function projectCard(p) {
  const idx = STEPS.indexOf(p.status);
  const docs = state.docs.filter((d) => d.project_id === p.id);
  return h('article', { class: 'card project-card' },
    h('div', { class: 'head' }, h('div', {}, h('h3', { style: 'margin:0' }, p.name), p.po_number ? h('span', { class: 'mono xs muted' }, `PO ${p.po_number}`) : null),
      statusBadge(PROJECT_STATUS, p.status, { delivered: 'ok', on_hold: 'warn', build: 'accent', test: 'accent', design: 'accent' })),
    p.description ? h('p', { class: 'muted small', style: 'margin:0' }, p.description) : null,
    p.status !== 'on_hold' ? h('div', {}, h('div', { class: 'steps-bar' }, STEPS.map((s, i) => h('i', { class: i <= idx ? 'on' : '' }))), h('div', { class: 'steps-labels' }, STEPS.map((s) => h('span', {}, PROJECT_STATUS[s].replace(' / FAT', ''))))) : null,
    h('dl', { class: 'dl', style: 'margin-top:.5rem' }, h('dt', {}, 'Started'), h('dd', {}, fmtDate(p.start_date)), h('dt', {}, 'Target'), h('dd', {}, fmtDate(p.due_date)), h('dt', {}, 'Files'), h('dd', {}, docs.length ? h('a', { href: `#/documents?project=${p.id}` }, `${docs.length} shared`) : 'None yet')));
}

const uploadBtn = () => btn('Upload files', () => uploadDialog({ companyId: profile.company_id, projects: state.projects, staff: false, onDone: async () => { await load(); route(); } }), '', 'upload');

const views = {
  async overview() {
    ui.set(state.company ? state.company.name : 'Overview', { active: 'overview', actions: [uploadBtn()] });
    const c = ui.content;
    if (!profile.company_id) { c.append(emptyState('Your account is not linked to a company yet', 'Contact your Stratabench engineer to finish setting up your portal.')); return; }
    const recent = state.docs.slice(0, 6);
    const lastMsgs = state.messages.slice(-3).reverse();
    c.append(
      h('p', { class: 'muted', style: 'margin:0 0 1.25rem' }, `Welcome, ${(profile.full_name || '').split(' ')[0] || 'there'}. Here's where your projects stand.`),
      h('h2', { class: 'small mono muted', style: 'letter-spacing:.08em;text-transform:uppercase;margin:0 0 .75rem' }, 'Projects'),
      state.projects.length ? h('div', { class: 'grid g2' }, state.projects.map(projectCard)) : h('div', { class: 'card' }, emptyState('No active projects yet', 'When a study or build starts, its status, PO reference and files will show here.')),
      h('div', { class: 'grid g2', style: 'margin-top:1.25rem' },
        h('section', { class: 'card' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Recent documents'), h('a', { href: '#/documents', class: 'small' }, 'All documents')),
          recent.length ? h('div', { class: 'list' }, recent.map((d) => h('div', { class: 'row' },
            h('span', { class: 'filetype' }, d.name.split('.').pop().toUpperCase().slice(0, 5)),
            h('div', { class: 'grow' }, h('div', { class: 'ellipsis small', style: 'font-weight:600' }, d.name), h('div', { class: 'xs muted' }, ago(d.created_at))),
            fileKind(d.name) !== 'other' ? h('button', { class: 'btn ghost sm', onclick: () => openDoc(d) }, fileKind(d.name) === '3d' ? '3D view' : 'View') : null))) : emptyState('No files yet', 'Shared files appear here.')),
        h('section', { class: 'card' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Latest messages'), h('a', { href: '#/messages', class: 'small' }, 'Open messages')),
          lastMsgs.length ? h('div', { class: 'grid', style: 'gap:.6rem' }, lastMsgs.map(msgEl)) : emptyState('No messages yet', 'Questions, files and updates all go through Messages.'))));
  },
  async documents(params) {
    ui.set('Documents', { active: 'documents' });
    const lib = docLibrary({ docs: state.docs, projects: state.projects, staff: false, uploadBtn });
    ui.content.append(lib);
    const pid = params.get('project'); if (pid) { const sel = lib.querySelectorAll('select')[1]; if (sel) { sel.value = pid; sel.dispatchEvent(new Event('input')); } }
  },

  async quotes(params) {
    ui.set('Quotes', { active: 'quotes' });
    const c = ui.content;
    const tone = { sent: 'accent', accepted: 'ok', declined: 'bad', superseded: '' };
    const label = { sent: 'Awaiting your review', accepted: 'Accepted', declined: 'Declined', superseded: 'Superseded' };
    c.append(h('p', { class: 'muted small', style: 'margin:0 0 1rem' }, 'Quotes from Stratabench. Open one to review it, save a PDF, accept it with your PO number, or ask for changes. Questions go to Messages.'));
    if (!state.quotes.length) { c.append(h('div', { class: 'card' }, emptyState('No quotes yet', 'When we send you a quote, it appears here and you get a message.'))); return; }
    c.append(h('div', { class: 'grid g2' }, state.quotes.map((x) => h('article', { class: 'card quote-card', tabindex: 0, role: 'button', onclick: () => openQuote(x), onkeydown: (e) => { if (e.key === 'Enter') openQuote(x); } },
      h('div', { class: 'row' }, h('span', { class: 'mono xs muted grow' }, `${x.number} · Rev ${x.revision}`), statusBadge(label, x.status, tone)),
      h('h3', { style: 'margin:.4rem 0' }, x.title),
      h('div', { class: 'row small' }, h('b', { class: 'mono grow' }, fmtMoney(x.total)), h('span', { class: 'muted xs' }, x.status === 'sent' && x.valid_until ? `Valid until ${fmtDate(x.valid_until)}` : x.responded_at ? `${label[x.status]} ${fmtDate(x.responded_at)}` : `Sent ${fmtDate(x.created_at)}`))))));
    const id = params.get('id'); const hit = state.quotes.find((x) => x.id === id); if (hit) openQuote(hit);
  },
  async messages() {
    ui.set('Messages', { active: 'messages' });
    if (!profile.company_id) { ui.content.append(emptyState('Your account is not linked to a company yet', 'Contact your Stratabench engineer to finish setting up your portal.')); return; }
    ui.content.append(h('p', { class: 'muted small', style: 'margin:0 0 1rem' }, 'All communication with Stratabench happens here: questions, files, quotes, and project updates. Attach CAD, drawings, or CMM/ATP pages directly to a message.'));
    ui.content.append(await threadView({ companyId: profile.company_id, projects: state.projects, me: profile, staff: false, onChange: async () => { await load(); route(); } }));
    refreshUnread(0);
  },
};


function openQuote(x) {
  const open = x.status === 'sent';
  const expired = open && x.valid_until && new Date(x.valid_until + 'T23:59:59') < new Date();
  modal({ title: `${x.number} · Rev ${x.revision}`, wide: true, body: h('div', { class: 'grid', style: 'gap:1rem' },
    expired ? h('div', { class: 'note warn small' }, 'This quote has passed its valid-until date. Ask for an updated revision in Messages.') : null,
    x.status === 'accepted' ? h('div', { class: 'note small' }, `Accepted by ${x.response_name || 'you'} on ${fmtDate(x.responded_at)}${x.response_po ? ` · PO ${x.response_po}` : ''}.`) : null,
    h('div', { class: 'qdoc-wrap' }, quoteDocument(x.snapshot, { status: x.status }))),
    actions: [
      { label: 'Save PDF / print', kind: 'ghost', onClick: () => { window.open(`/quote.html?pq=${x.id}`, '_blank'); return false; } },
      ...(open ? [
        { label: 'Ask for changes', kind: 'ghost', onClick: () => respond(x, 'changes') },
        { label: 'Decline', kind: 'ghost', onClick: () => respond(x, 'decline') },
        ...(expired ? [] : [{ label: 'Accept quote', onClick: () => respond(x, 'accept') }]),
      ] : []),
    ] });
}
function respond(x, action) {
  const name = h('input', { class: 'input', value: profile.full_name || '', autocomplete: 'name' });
  const po = h('input', { class: 'input', placeholder: 'Optional now; you can send it later' });
  const note = h('textarea', { class: 'input', rows: 4, placeholder: action === 'changes' ? 'What should change? Scope, quantities, options, schedule…' : 'Optional note' });
  const auth = h('input', { type: 'checkbox' });
  const titles = { accept: 'Accept quote', decline: 'Decline quote', changes: 'Ask for changes' };
  setTimeout(() => modal({ title: titles[action], body: h('div', { class: 'grid', style: 'gap:.85rem' },
    action === 'accept' ? h('p', { class: 'small', style: 'margin:0' }, `You're accepting ${x.number} Rev ${x.revision}, ${x.title}, for ${fmtMoney(x.total)} under the terms shown in the quote.`) : null,
    h('label', { class: 'f' }, 'Your name', name),
    action === 'accept' ? h('label', { class: 'f' }, 'PO number', po) : null,
    h('label', { class: 'f' }, action === 'changes' ? 'Requested changes' : 'Note', note),
    action === 'accept' ? h('label', { class: 'switch small' }, auth, `I'm authorized to accept this quote for ${state.company?.name || 'my company'}.`) : null,
    action === 'accept' ? h('p', { class: 'xs muted', style: 'margin:0' }, 'You can attach the PO document in Messages.') : null),
    actions: [{ label: 'Cancel', kind: 'ghost' }, { label: titles[action], kind: action === 'decline' ? 'danger' : '', onClick: async () => {
      if (!name.value.trim()) { toast('Type your name.', true); return false; }
      if (action === 'accept' && !auth.checked) { toast('Confirm you are authorized to accept.', true); return false; }
      if (action === 'changes' && !note.value.trim()) { toast('Tell us what should change.', true); return false; }
      const { error } = await sb.rpc('respond_quote', { p_id: x.id, p_action: action, p_name: name.value.trim(), p_po: po.value.trim() || null, p_note: note.value.trim() || null });
      if (error) { toast(error.message, true); return false; }
      toast(action === 'accept' ? 'Accepted. Stratabench has been notified.' : action === 'decline' ? 'Declined. Stratabench has been notified.' : 'Sent. Stratabench will follow up in Messages.');
      await load(); location.hash = action === 'changes' ? '#/messages' : '#/quotes'; route();
    } }] }), 0);
}

function msgEl(m) {
  const mine = m.author_id === profile.id;
  const proj = state.projects.find((p) => p.id === m.project_id);
  return h('div', { class: 'msg' + (mine ? ' mine' : '') }, h('div', { class: 'meta' }, h('b', {}, mine ? 'You' : (state.names[m.author_id] || 'Stratabench')), h('span', {}, ago(m.created_at)), proj ? h('span', {}, '· ' + proj.name) : null), h('p', {}, m.body));
}

async function refreshUnread(force) {
  if (force === 0) { ui.count('messages', 0); return; }
  const u = await unreadSummary(); ui.count('messages', u.reduce((a, r) => a + Number(r.unread || 0), 0));
}
async function route() {
  const [path, qs] = (location.hash.slice(2) || 'overview').split('?');
  const v = views[path] || views.overview;
  if (path !== 'messages') refreshUnread();
  await v(new URLSearchParams(qs || ''));
}
ui.content.append(loading());
await load();
window.addEventListener('hashchange', route);
await route();
setInterval(() => { if (!location.hash.includes('messages')) refreshUnread(); }, 60000);
import('./notify.js').then((n) => n.boot(profile)).catch(() => {});
