import { sb, h, icon, requireRole, shell, passwordDialog, fmtDate, fmtDateTime, fmtMoney, fmtBytes, ago, PROJECT_STATUS, STAGES, CATEGORIES, statusBadge, emptyState, loading, btn, toast, modal, confirmDialog, formFields, table } from './core.js';
import { docLibrary, uploadDialog } from './docs.js';
import { threadView, unreadSummary } from './thread.js';
import { SUPABASE_URL } from './config.js';
import { entryFiles, filesDialog, attachmentCounts, clipBadge, fileDropTarget, attachFiles } from './attach.js';

const me = await requireRole(['employee', 'admin']);
const isAdmin = me.role === 'admin';
const isSuper = isAdmin && !!me.is_superadmin;
const ui = shell({ profile: me, subtitle: 'Workspace', items: [
  { id: 'dashboard', label: 'Dashboard', icon: 'dash' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', count: true },
  { id: 'messages', label: 'Messages', icon: 'msg', count: true },
  { id: 'companies', label: 'Companies', icon: 'building' },
  { id: 'pipeline', label: 'Pipeline', icon: 'pipeline' },
  { id: 'projects', label: 'Projects', icon: 'wrench' },
  { id: 'documents', label: 'Documents', icon: 'folder' },
  { id: 'tasks', label: 'Tasks', icon: 'check', count: true },
  { id: 'team', label: isAdmin ? 'Users & access' : 'Customer logins', icon: 'users' },
  ...(isSuper ? [{ id: 'monitor', label: 'Monitor', icon: 'shield' }] : []),
] });
if (me.must_change_password) await passwordDialog(me, true);

/* ---------- data helpers ---------- */
const q = async (p) => { const { data, error } = await p; if (error) { toast(error.message, true); throw error; } return data; };
const all = (t, sel = '*', order = 'created_at', asc = false) => q(sb.from(t).select(sel).order(order, { ascending: asc }));
let staffCache = null;
async function staff() { staffCache ||= await q(sb.from('profiles').select('id,full_name,email,role').in('role', ['employee', 'admin'])); return staffCache; }
const nameOf = (list, id) => { const p = list.find((x) => x.id === id); return p ? (p.full_name || p.email) : '—'; };
async function refreshCounts() {
  const [{ count: n }, { count: t }] = await Promise.all([
    sb.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    sb.from('activities').select('id', { count: 'exact', head: true }).eq('kind', 'task').eq('done', false).lte('due_at', new Date(Date.now() + 864e5).toISOString()),
  ]);
  ui.count('inbox', n || 0); ui.count('tasks', t || 0);
  const u = await unreadSummary(); ui.count('messages', u.reduce((a, r) => a + Number(r.unread || 0), 0));
}
const KIND_LABEL = { quote: 'Test requirement', callback: 'Callback', feedback: 'Automation feedback' };
const INQ_STATUS = { new: 'New', contacted: 'Contacted', converted: 'Converted', closed: 'Closed' };
const COMPANY_KIND = { prospect: 'Prospect', customer: 'Customer', partner: 'Partner', vendor: 'Vendor' };
const ACT_KIND = { note: 'Note', call: 'Call', email: 'Email', meeting: 'Meeting', task: 'Task' };
const stageTone = { po: 'ok', delivered: 'ok', lost: 'bad', quoted: 'accent', study: 'accent' };

/* ---------- reusable dialogs ---------- */
function editDialog({ title, specs, values = {}, onSave, onDelete, extra }) {
  const f = formFields(specs, values);
  const actions = [];
  if (onDelete) actions.push({ label: 'Delete', kind: 'danger', onClick: async () => { if (!(await confirmDialog('Delete?', 'This cannot be undone.'))) return false; await onDelete(); } });
  actions.push({ label: 'Cancel', kind: 'ghost' }, { label: 'Save', onClick: async () => { const v = f.read(); const miss = specs.find((s) => s.required && !v[s.name]); if (miss) { toast(`${miss.label} is required.`, true); return false; } await onSave(v); } });
  modal({ title, body: extra ? h('div', { class: 'grid', style: 'gap:1.25rem' }, f.el, extra) : f.el, actions, wide: specs.length > 6 || !!extra });
}
const companySpecs = [
  { name: 'name', label: 'Company name', required: true, full: true },
  { name: 'kind', label: 'Type', type: 'select', options: COMPANY_KIND },
  { name: 'phone', label: 'Phone' },
  { name: 'city', label: 'City' }, { name: 'state', label: 'State' },
  { name: 'website', label: 'Website', full: true },
  { name: 'notes', label: 'Internal notes (never shown to customers)', type: 'textarea', full: true },
];
const contactSpecs = [
  { name: 'full_name', label: 'Name', required: true }, { name: 'title', label: 'Title' },
  { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone' },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true },
];
const dealSpecs = (companies, st) => [
  { name: 'title', label: 'Opportunity', required: true, full: true },
  ...(companies ? [{ name: 'company_id', label: 'Company', type: 'select', options: Object.fromEntries([['', 'Choose…'], ...companies.map((c) => [c.id, c.name])]) }] : []),
  { name: 'stage', label: 'Stage', type: 'select', options: STAGES },
  { name: 'value', label: 'Value (USD)', type: 'number', step: '1' },
  { name: 'close_date', label: 'Expected close', type: 'date' },
  { name: 'owner_id', label: 'Owner', type: 'select', options: Object.fromEntries([['', 'Unassigned'], ...st.map((s) => [s.id, s.full_name || s.email])]) },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true },
];
const projectSpecs = (companies) => [
  { name: 'name', label: 'Project name', required: true, full: true },
  ...(companies ? [{ name: 'company_id', label: 'Company', type: 'select', options: Object.fromEntries([['', 'Choose…'], ...companies.map((c) => [c.id, c.name])]) }] : []),
  { name: 'status', label: 'Status', type: 'select', options: PROJECT_STATUS },
  { name: 'po_number', label: 'PO number' },
  { name: 'start_date', label: 'Start', type: 'date' }, { name: 'due_date', label: 'Target date', type: 'date' },
  { name: 'description', label: 'Description (customer can see this)', type: 'textarea', full: true },
  { name: 'visible_to_customer', label: 'Show this project in the customer portal', type: 'checkbox', full: true, value: true },
];
const taskSpecs = (companies) => [
  { name: 'body', label: 'Task', required: true, full: true },
  { name: 'due_at', label: 'Due', type: 'datetime-local' },
  ...(companies ? [{ name: 'company_id', label: 'Company', type: 'select', options: Object.fromEntries([['', 'None'], ...companies.map((c) => [c.id, c.name])]) }] : []),
];
const toLocalInput = (d) => d ? new Date(new Date(d) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
const fromLocalInput = (v) => v ? new Date(v).toISOString() : null;

function credentialsDialog(email, pw, isNew = true) {
  modal({ title: isNew ? 'Login created' : 'Password reset', body: h('div', { class: 'grid', style: 'gap:.75rem' },
    h('p', { style: 'margin:0' }, `Send these to the user through a channel you trust (a phone call or a separate email). They'll be asked to choose their own password at first sign-in.`),
    h('dl', { class: 'dl' }, h('dt', {}, 'Sign-in page'), h('dd', {}, h('span', { class: 'mono xs' }, location.origin + location.pathname.replace(/crm\.html$/, 'login.html'))), h('dt', {}, 'Email'), h('dd', { class: 'mono' }, email)),
    h('div', { class: 'secret', 'aria-label': 'Temporary password' }, pw),
    h('p', { class: 'muted xs', style: 'margin:0' }, 'This password is shown only once and is not stored anywhere you can retrieve it.')),
  actions: [{ label: 'Copy password', kind: 'ghost', onClick: async () => { await navigator.clipboard.writeText(pw); toast('Copied.'); return false; } }, { label: 'Done' }] });
}
async function adminUsers(payload) {
  const { data, error } = await sb.functions.invoke('admin-users', { body: payload });
  if (error) { let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch {} throw new Error(msg); }
  if (data?.error) throw new Error(data.error);
  return data;
}
function newLoginDialog({ companies, companyId = '', role = 'customer', contact, onDone }) {
  const specs = [
    { name: 'full_name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'title', label: 'Title' },
    { name: 'role', label: 'Access', type: 'select', options: isAdmin ? { customer: 'Customer (portal only)', employee: 'Employee (CRM + documents)', admin: 'Admin (also manages users)' } : { customer: 'Customer (portal only)' } },
    { name: 'company_id', label: 'Customer company', type: 'select', full: true, options: Object.fromEntries([['', '— none (staff) —'], ...companies.map((c) => [c.id, c.name])]) },
  ];
  editDialog({ title: 'Create login', specs, values: { role, company_id: companyId, full_name: contact?.full_name, email: contact?.email, title: contact?.title }, onSave: async (v) => {
    if (v.role === 'customer' && !v.company_id) { toast('Customers must be linked to a company.', true); throw new Error('Pick a company'); }
    const r = await adminUsers({ action: 'create', ...v, company_id: v.role === 'customer' ? v.company_id : null });
    staffCache = null; credentialsDialog(r.email, r.temp_password); onDone?.();
  } });
}

/* ---------- views ---------- */
const views = {};

views.dashboard = async () => {
  ui.set('Dashboard', { active: 'dashboard' });
  ui.content.append(loading());
  const [inq, deals, tasks, docs, projects, companies] = await Promise.all([
    q(sb.from('inquiries').select('*').order('created_at', { ascending: false }).limit(8)),
    all('deals'), q(sb.from('activities').select('*').eq('kind', 'task').eq('done', false).order('due_at', { ascending: true, nullsFirst: false }).limit(8)),
    q(sb.from('documents').select('id,name,company_id,created_at,size_bytes').order('created_at', { ascending: false }).limit(6)),
    all('projects'), all('companies', 'id,name'),
  ]);
  const cname = (id) => companies.find((c) => c.id === id)?.name || '';
  const open = deals.filter((d) => !['delivered', 'lost', 'po'].includes(d.stage));
  const pipeline = open.reduce((a, d) => a + (Number(d.value) || 0), 0);
  const won = deals.filter((d) => ['po', 'delivered'].includes(d.stage));
  const newCount = inq.filter((i) => i.status === 'new').length;
  ui.content.innerHTML = '';
  ui.content.append(
    h('div', { class: 'grid g4' },
      kpi('New inquiries', newCount, 'from the website forms', '#/inbox'),
      kpi('Open opportunities', open.length, fmtMoney(pipeline) + ' in pipeline', '#/pipeline'),
      kpi('POs received', won.length, fmtMoney(won.reduce((a, d) => a + (Number(d.value) || 0), 0)) + ' booked', '#/pipeline'),
      kpi('Active projects', projects.filter((p) => !['delivered', 'on_hold'].includes(p.status)).length, `${projects.length} total`, '#/projects')),
    h('div', { class: 'grid g2', style: 'margin-top:1rem' },
      h('section', { class: 'card' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Latest inquiries'), h('a', { href: '#/inbox', class: 'small' }, 'Inbox')),
        inq.length ? h('div', { class: 'list' }, inq.map((i) => h('a', { href: `#/inbox?id=${i.id}`, class: 'row', style: 'text-decoration:none;color:inherit' },
          h('div', { class: 'grow' }, h('div', { class: 'small', style: 'font-weight:600' }, i.name, i.company ? h('span', { class: 'muted' }, ' · ' + i.company) : null), h('div', { class: 'xs muted ellipsis' }, i.test_type || i.message || '')),
          h('span', { class: 'badge ' + (i.status === 'new' ? 'accent' : '') }, KIND_LABEL[i.kind]), h('span', { class: 'xs muted', style: 'white-space:nowrap' }, ago(i.created_at))))) : emptyState('No inquiries yet', 'Submissions from the website forms land here.')),
      h('section', { class: 'card' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Open tasks'), h('a', { href: '#/tasks', class: 'small' }, 'All tasks')),
        tasks.length ? h('div', { class: 'list' }, tasks.map((t) => taskRow(t, cname, () => views.dashboard()))) : emptyState('Nothing due', 'Add follow-ups from a company or the Tasks page.'))),
    h('section', { class: 'card', style: 'margin-top:1rem' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Recently uploaded'), h('a', { href: '#/documents', class: 'small' }, 'Documents')),
      docs.length ? h('div', { class: 'list' }, docs.map((d) => h('div', { class: 'row' }, h('span', { class: 'filetype' }, d.name.split('.').pop().toUpperCase().slice(0, 5)), h('span', { class: 'grow small ellipsis' }, d.name), h('span', { class: 'xs muted' }, cname(d.company_id) || 'Internal'), h('span', { class: 'xs muted mono' }, fmtBytes(d.size_bytes))))) : emptyState('No files yet', '')));
  refreshCounts();
};
function kpi(label, value, sub, href) { return h('a', { class: 'card kpi', href, style: 'text-decoration:none;color:inherit' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), h('div', { class: 'sub' }, sub)); }
function taskRow(t, cname, after, nFiles = 0) {
  const overdue = t.due_at && new Date(t.due_at) < new Date() && !t.done;
  const cb = h('input', { type: 'checkbox', checked: t.done, 'aria-label': 'Mark done', onchange: async () => { await q(sb.from('activities').update({ done: cb.checked }).eq('id', t.id)); toast(cb.checked ? 'Task done.' : 'Task reopened.'); refreshCounts(); after?.(); } });
  return h('div', { class: 'row' }, cb, h('div', { class: 'grow' }, h('div', { class: 'small', style: t.done ? 'text-decoration:line-through;color:var(--muted)' : '' }, t.body), h('div', { class: 'xs muted' }, [cname?.(t.company_id), t.due_at ? 'Due ' + fmtDateTime(t.due_at) : null].filter(Boolean).join(' · '))), overdue ? h('span', { class: 'badge bad' }, 'Overdue') : null,
    h('button', { class: 'btn quiet sm', type: 'button', title: 'Files', 'aria-label': `Files for task: ${t.body}`, onclick: () => filesDialog({ link: { activity_id: t.id }, companyId: t.company_id, label: 'this task', onClose: after }, 'Task files') }, icon('clip'), nFiles ? String(nFiles) : ''));
}

views.inbox = async (params) => {
  ui.set('Inbox', { active: 'inbox' });
  const filter = params.get('status') || 'open';
  const [rows, inqFiles] = await Promise.all([all('inquiries'), attachmentCounts('inquiry_id')]);
  const tabs = h('div', { class: 'subtabs', role: 'tablist' }, ...[['open', 'Open'], ['new', 'New'], ['converted', 'Converted'], ['closed', 'Closed'], ['all', 'All']].map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(k === filter), onclick: () => { location.hash = `#/inbox?status=${k}`; } }, l)));
  const shown = rows.filter((r) => filter === 'all' ? true : filter === 'open' ? ['new', 'contacted'].includes(r.status) : r.status === filter);
  ui.content.append(tabs, table([
    { label: 'Received', render: (r) => h('span', { class: 'small muted', style: 'white-space:nowrap' }, ago(r.created_at)) },
    { label: 'From', render: (r) => h('div', {}, h('div', { style: 'font-weight:600' }, r.name), h('div', { class: 'xs muted' }, [r.company, r.email].filter(Boolean).join(' · '))) },
    { label: 'Type', render: (r) => h('span', { class: 'badge' }, KIND_LABEL[r.kind]) },
    { label: 'Need', render: (r) => h('div', { class: 'small ellipsis', style: 'max-width:22rem' }, r.test_type || r.message || (r.details?.interests || []).join(', ') || '—') },
    { label: 'Status', render: (r) => h('span', { class: 'row', style: 'gap:.35rem;flex-wrap:nowrap' }, statusBadge(INQ_STATUS, r.status, { new: 'accent', converted: 'ok' }), clipBadge(inqFiles[r.id])) },
  ], shown, { onRow: (r) => inquiryDialog(r), empty: emptyState('Inbox is clear', 'Website submissions appear here: test requirements, callback requests and automation feedback.') }));
  const id = params.get('id'); if (id) { const r = rows.find((x) => x.id === id); if (r) inquiryDialog(r); }
  refreshCounts();
};
function inquiryDialog(r) {
  const field = (k, v) => v ? [h('dt', {}, k), h('dd', {}, v)] : [];
  const body = h('div', { class: 'grid', style: 'gap:1rem' },
    h('div', { class: 'row' }, h('span', { class: 'badge' }, KIND_LABEL[r.kind]), statusBadge(INQ_STATUS, r.status, { new: 'accent', converted: 'ok' }), h('span', { class: 'muted xs' }, fmtDateTime(r.created_at))),
    h('dl', { class: 'dl' }, ...field('Name', r.name), ...field('Company', r.company), ...field('Email', r.email ? h('a', { href: `mailto:${r.email}` }, r.email) : null), ...field('Phone', r.phone ? h('a', { href: `tel:${r.phone}` }, r.phone) : null),
      ...field('Need', r.test_type), ...field('Media', r.media), ...field('Component', r.component), ...field(r.kind === 'callback' ? 'Best time' : 'Target date', r.target_date),
      ...field('Documents', r.details?.documents), ...field('Interested in', (r.details?.interests || []).join(', '))),
    r.message ? h('div', { class: 'msg' }, h('p', {}, r.message)) : null,
    entryFiles({ link: { inquiry_id: r.id }, companyId: r.company_id || null, label: 'this inquiry' }),
    r.status !== 'converted' ? h('p', { class: 'muted xs', style: 'margin:0' }, 'Customer communication runs through the portal. Convert this inquiry to create the company and a portal login, then reply in its Messages tab. Files attached here move to the company when you convert.') : null);
  const setStatus = async (s) => { await q(sb.from('inquiries').update({ status: s }).eq('id', r.id)); toast(`Marked ${INQ_STATUS[s].toLowerCase()}.`); route(); };
  modal({ title: r.company || r.name, body, wide: true, actions: [
    ...(r.status !== 'closed' ? [{ label: 'Close', kind: 'ghost', onClick: () => setStatus('closed') }] : []),
    ...(r.status === 'new' ? [{ label: 'Mark contacted', kind: 'ghost', onClick: () => setStatus('contacted') }] : []),
    ...(r.status !== 'converted' ? [{ label: 'Convert to company + opportunity', onClick: () => convertInquiry(r) }] : r.company_id ? [{ label: 'Open company', onClick: () => { location.hash = `#/company/${r.company_id}`; } }] : []),
  ] });
}
async function convertInquiry(r) {
  const companyName = r.company || r.name;
  let company = (await q(sb.from('companies').select('*').ilike('name', companyName)))[0];
  if (!company) company = (await q(sb.from('companies').insert({ name: companyName, kind: 'prospect', phone: r.phone, owner_id: me.id }).select().single()));
  let contactId = null;
  if (r.name) {
    const existing = r.email ? (await q(sb.from('contacts').select('id').eq('company_id', company.id).eq('email', r.email)))[0] : null;
    contactId = existing?.id || (await q(sb.from('contacts').insert({ company_id: company.id, full_name: r.name, email: r.email, phone: r.phone }).select('id').single())).id;
  }
  let dealId = null;
  if (r.kind !== 'feedback') {
    dealId = (await q(sb.from('deals').insert({ company_id: company.id, contact_id: contactId, title: r.test_type ? `${r.test_type}${r.component ? ' — ' + r.component : ''}` : `Inquiry from ${r.name}`, stage: 'lead', owner_id: me.id, notes: [r.media && `Media: ${r.media}`, r.target_date && `Target: ${r.target_date}`, r.message].filter(Boolean).join('\n') }).select('id').single())).id;
  }
  await q(sb.from('documents').update({ company_id: company.id, ...(dealId ? { deal_id: dealId } : {}) }).eq('inquiry_id', r.id).is('company_id', null));
  const summary = [`Website ${KIND_LABEL[r.kind].toLowerCase()} from ${r.name}`, r.test_type, r.media, r.component, r.target_date && `Target: ${r.target_date}`, r.details?.interests?.join(', '), r.message].filter(Boolean).join('\n');
  await q(sb.from('activities').insert({ company_id: company.id, contact_id: contactId, kind: 'note', body: summary }));
  await q(sb.from('activities').insert({ company_id: company.id, contact_id: contactId, kind: 'task', body: `Follow up with ${r.name}${r.kind === 'callback' ? ' (callback requested)' : ''}`, due_at: new Date(Date.now() + 864e5).toISOString() }));
  await q(sb.from('inquiries').update({ status: 'converted', company_id: company.id }).eq('id', r.id));
  toast('Converted. Company, contact, opportunity and a follow-up task were created.');
  location.hash = `#/company/${company.id}?tab=portal`;
  if (r.email) {
    const existing = (await q(sb.from('profiles').select('id').eq('email', r.email.toLowerCase()))).length;
    if (!existing) setTimeout(() => newLoginDialog({ companies: [company], companyId: company.id, contact: { full_name: r.name, email: r.email }, onDone: () => route() }), 600);
  }
}

views.messages = async () => {
  ui.set('Messages', { active: 'messages' });
  const [sum, companies, latest] = await Promise.all([unreadSummary(), all('companies', 'id,name,kind', 'name', true), q(sb.from('messages').select('company_id,body,created_at,internal').order('created_at', { ascending: false }).limit(500))]);
  const last = {}; latest.forEach((m) => { last[m.company_id] ||= m; });
  const rows = sum.map((r) => ({ ...r, company: companies.find((c) => c.id === r.company_id), msg: last[r.company_id] })).filter((r) => r.company).sort((a, b) => (Number(b.unread) > 0) - (Number(a.unread) > 0) || new Date(b.last_at) - new Date(a.last_at));
  ui.content.append(h('p', { class: 'muted small', style: 'margin:0 0 1rem' }, 'Every customer conversation happens in the portal. Threads with new customer messages are listed first.'));
  if (!rows.length) { ui.content.append(h('div', { class: 'card' }, emptyState('No conversations yet', 'Open a company and send the first message from its Messages tab. Customers see it in their portal.'))); return; }
  ui.content.append(h('div', { class: 'card thread-list' }, h('div', { class: 'list' }, rows.map((r) => h('a', { href: `#/company/${r.company_id}?tab=messages`, class: 'row', style: 'text-decoration:none;color:inherit' },
    Number(r.unread) ? h('span', { class: 'unread-dot', 'aria-label': 'Unread' }) : h('span', { style: 'width:.55rem' }),
    h('div', { class: 'grow' }, h('div', { style: 'font-weight:' + (Number(r.unread) ? 700 : 500) }, r.company.name), h('div', { class: 'xs muted ellipsis' }, (r.msg?.internal ? 'Internal note: ' : '') + (r.msg?.body || '').split('\n')[0])),
    Number(r.unread) ? h('span', { class: 'badge accent' }, `${r.unread} new`) : null,
    h('span', { class: 'xs muted', style: 'white-space:nowrap' }, ago(r.last_at)))))));
};

views.companies = async () => {
  ui.set('Companies', { active: 'companies', actions: [btn('Add company', () => editDialog({ title: 'Add company', specs: companySpecs, values: { kind: 'prospect' }, onSave: async (v) => { const c = await q(sb.from('companies').insert({ ...v, owner_id: me.id }).select().single()); location.hash = `#/company/${c.id}`; } }), '', 'plus')] });
  const [companies, deals, contacts] = await Promise.all([all('companies', '*', 'name', true), all('deals', 'company_id,stage,value'), all('contacts', 'company_id')]);
  const search = h('input', { class: 'input search', type: 'search', placeholder: 'Search companies', 'aria-label': 'Search companies' });
  const kindSel = h('select', { class: 'input', style: 'width:auto', 'aria-label': 'Filter type' }, h('option', { value: '' }, 'All types'), Object.entries(COMPANY_KIND).map(([k, v]) => h('option', { value: k }, v)));
  const holder = h('div');
  const render = () => {
    const t = search.value.toLowerCase();
    const rows = companies.filter((c) => (!t || `${c.name} ${c.city || ''}`.toLowerCase().includes(t)) && (!kindSel.value || c.kind === kindSel.value));
    holder.innerHTML = '';
    holder.append(table([
      { label: 'Company', render: (c) => h('div', { style: 'font-weight:600' }, c.name) },
      { label: 'Type', render: (c) => statusBadge(COMPANY_KIND, c.kind, { customer: 'ok' }) },
      { label: 'Location', render: (c) => h('span', { class: 'small muted' }, [c.city, c.state].filter(Boolean).join(', ') || '—') },
      { label: 'Contacts', render: (c) => h('span', { class: 'mono small' }, contacts.filter((x) => x.company_id === c.id).length) },
      { label: 'Open pipeline', render: (c) => h('span', { class: 'mono small' }, fmtMoney(deals.filter((d) => d.company_id === c.id && !['lost', 'delivered', 'po'].includes(d.stage)).reduce((a, d) => a + (Number(d.value) || 0), 0))) },
    ], rows, { onRow: (c) => { location.hash = `#/company/${c.id}`; }, empty: emptyState(companies.length ? 'No matches' : 'No companies yet', companies.length ? 'Try another search.' : 'Add one, or convert a website inquiry from the Inbox.') }));
  };
  search.oninput = render; kindSel.oninput = render; render();
  ui.content.append(h('div', { class: 'toolbar' }, search, kindSel), holder);
};

views.company = async (params, id) => {
  const tab = params.get('tab') || 'overview';
  const [company, contacts, deals, projects, docs, acts, msgs, users, st] = await Promise.all([
    q(sb.from('companies').select('*').eq('id', id).single()),
    q(sb.from('contacts').select('*').eq('company_id', id).order('full_name')),
    q(sb.from('deals').select('*').eq('company_id', id).order('created_at', { ascending: false })),
    q(sb.from('projects').select('*').eq('company_id', id).order('created_at', { ascending: false })),
    q(sb.from('documents').select('*').eq('company_id', id).order('created_at', { ascending: false })),
    q(sb.from('activities').select('*').eq('company_id', id).order('created_at', { ascending: false })),
    q(sb.from('messages').select('*').eq('company_id', id).order('created_at', { ascending: true })),
    q(sb.from('profiles').select('*').eq('company_id', id).eq('role', 'customer')),
    staff(),
  ]);
  const reload = () => route();
  ui.set(company.name, { active: 'companies', back: { href: '#/companies', label: 'Companies' }, actions: [
    btn('Edit', () => editDialog({ title: 'Edit company', specs: companySpecs, values: company, onSave: async (v) => { await q(sb.from('companies').update(v).eq('id', id)); reload(); }, onDelete: async () => { await q(sb.from('companies').delete().eq('id', id)); location.hash = '#/companies'; } }), 'ghost'),
    btn('Upload', () => uploadDialog({ companyId: id, projects, staff: true, onDone: () => { location.hash = `#/company/${id}?tab=documents`; reload(); } }), '', 'upload'),
  ] });
  const T = [['overview', 'Overview'], ['contacts', `Contacts (${contacts.length})`], ['deals', `Opportunities (${deals.length})`], ['projects', `Projects (${projects.length})`], ['documents', `Documents (${docs.length})`], ['messages', `Messages (${msgs.length})`], ['portal', `Portal logins (${users.length})`]];
  ui.content.append(h('div', { class: 'subtabs', role: 'tablist' }, T.map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(k === tab), onclick: () => { location.hash = `#/company/${id}?tab=${k}`; } }, l))));
  const c = ui.content;
  const addContact = () => editDialog({ title: 'Add contact', specs: contactSpecs, onSave: async (v) => { await q(sb.from('contacts').insert({ ...v, company_id: id })); reload(); } });
  const addDeal = () => editDialog({ title: 'New opportunity', specs: dealSpecs(null, st), values: { stage: 'lead', owner_id: me.id }, onSave: async (v) => { await q(sb.from('deals').insert({ ...v, company_id: id })); reload(); } });
  const addProject = () => editDialog({ title: 'New project', specs: projectSpecs(null), values: { status: 'study', visible_to_customer: true }, onSave: async (v) => { await q(sb.from('projects').insert({ ...v, company_id: id })); if (company.kind === 'prospect') await q(sb.from('companies').update({ kind: 'customer' }).eq('id', id)); reload(); } });

  if (tab === 'overview') {
    const logBox = h('textarea', { class: 'input', rows: 3, placeholder: 'Log a call, email, meeting or note…', 'aria-label': 'Activity' });
    const kindSel = h('select', { class: 'input', style: 'width:auto' }, Object.entries(ACT_KIND).map(([k, v]) => h('option', { value: k }, v)));
    const due = h('input', { class: 'input', type: 'datetime-local', style: 'width:auto', title: 'Due (tasks)' });
    kindSel.onchange = () => { due.classList.toggle('hidden', kindSel.value !== 'task'); }; due.classList.add('hidden');
    const actDocs = {}; docs.forEach((d) => { if (d.activity_id) (actDocs[d.activity_id] ||= []).push(d); });
    const pending = []; const pendingEl = h('div', { class: 'row', style: 'gap:.35rem;flex-wrap:wrap' });
    const showPending = () => pendingEl.replaceChildren(...pending.map((f, i) => h('span', { class: 'badge', style: 'gap:.3rem' }, icon('clip'), f.name, h('button', { class: 'icon-btn', style: 'width:1.2rem;height:1.2rem', type: 'button', 'aria-label': `Remove ${f.name}`, onclick: () => { pending.splice(i, 1); showPending(); } }, icon('x')))));
    const picker = h('input', { type: 'file', multiple: true, class: 'hidden', onchange: () => { pending.push(...picker.files); picker.value = ''; showPending(); } });
    logBox.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); pending.push(...f.map((x) => new File([x], `screenshot-${Date.now()}.png`, { type: x.type }))); showPending(); } });
    const composer = h('div', { class: 'grid', style: 'gap:.5rem;margin-bottom:1rem' });
    composer.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); composer.classList.add('file-over'); } });
    composer.addEventListener('dragleave', () => composer.classList.remove('file-over'));
    composer.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); composer.classList.remove('file-over'); pending.push(...e.dataTransfer.files); showPending(); logBox.focus(); } });
    const docChip = (d) => h('button', { class: 'chip-file', type: 'button', title: `${d.name} · ${fmtBytes(d.size_bytes)}`, onclick: () => import('./core.js').then((m) => (['3d', 'pdf', 'image', 'text'].includes(m.fileKind(d.name)) ? m.openDoc(d) : m.downloadDoc(d))) }, icon('clip'), h('span', { class: 'ellipsis' }, d.name));
    const timeline = h('div', { class: 'list' }, acts.length ? acts.map((a) => a.kind === 'task' ? h('div', {}, taskRow(a, null, reload, (actDocs[a.id] || []).length), (actDocs[a.id] || []).length ? h('div', { class: 'row', style: 'gap:.35rem;flex-wrap:wrap;margin:.35rem 0 0 1.7rem' }, actDocs[a.id].map(docChip)) : null) : (() => {
      const item = h('div', {},
        h('div', { class: 'row xs muted', style: 'gap:.5rem' }, h('span', { class: 'badge' }, ACT_KIND[a.kind]), h('span', {}, nameOf(st, a.author_id)), h('span', { class: 'grow' }, ago(a.created_at)),
          h('button', { class: 'btn quiet sm', type: 'button', title: 'Attach or view files', 'aria-label': 'Files for this entry', onclick: () => filesDialog({ link: { activity_id: a.id }, companyId: id, label: 'this entry', onClose: reload }, `${ACT_KIND[a.kind]} files`) }, icon('clip'), (actDocs[a.id] || []).length ? String(actDocs[a.id].length) : '')),
        h('p', { class: 'small', style: 'margin:.35rem 0 0;white-space:pre-wrap' }, a.body),
        (actDocs[a.id] || []).length ? h('div', { class: 'row', style: 'gap:.35rem;flex-wrap:wrap;margin-top:.4rem' }, actDocs[a.id].map(docChip)) : null);
      fileDropTarget(item, { link: { activity_id: a.id }, companyId: id, label: 'this entry' }, reload);
      return item;
    })()) : emptyState('No activity yet', 'Log the first call or note above. Drop files onto any entry to attach them.'));
    const open = deals.filter((d) => !['lost', 'delivered'].includes(d.stage));
    c.append(h('div', { class: 'grid', style: 'grid-template-columns:minmax(0,2fr) minmax(16rem,1fr);gap:1rem' },
      h('section', { class: 'card' }, h('h2', {}, 'Activity'),
        (composer.append(logBox, pendingEl, h('div', { class: 'row' }, kindSel, due, picker, btn('Attach', () => picker.click(), 'quiet sm', 'clip'), h('div', { class: 'grow' }), btn('Log', async (e) => {
          const text = logBox.value.trim() || (pending.length ? `Attached ${pending.length} file${pending.length > 1 ? 's' : ''}` : '');
          if (!text) return;
          const b = e.currentTarget; b.disabled = true;
          try {
            const act = await q(sb.from('activities').insert({ company_id: id, kind: kindSel.value, body: text, due_at: kindSel.value === 'task' ? fromLocalInput(due.value) : null }).select('id').single());
            if (pending.length) { toast(`Uploading ${pending.length} file(s)…`); await attachFiles(pending.splice(0), { link: { activity_id: act.id }, companyId: id, listEl: pendingEl }); }
          } finally { b.disabled = false; }
          toast('Logged.'); reload(); refreshCounts();
        }))), composer), timeline),
      h('div', { class: 'grid', style: 'gap:1rem;align-content:start' },
        h('section', { class: 'card' }, h('h2', {}, 'Details'), h('dl', { class: 'dl' },
          h('dt', {}, 'Type'), h('dd', {}, COMPANY_KIND[company.kind]), h('dt', {}, 'Location'), h('dd', {}, [company.city, company.state].filter(Boolean).join(', ') || '—'),
          h('dt', {}, 'Phone'), h('dd', {}, company.phone ? h('a', { href: `tel:${company.phone}` }, company.phone) : '—'),
          h('dt', {}, 'Website'), h('dd', {}, company.website ? h('a', { href: company.website.startsWith('http') ? company.website : 'https://' + company.website, target: '_blank', rel: 'noopener' }, company.website) : '—'),
          h('dt', {}, 'Owner'), h('dd', {}, nameOf(st, company.owner_id))),
          company.notes ? h('p', { class: 'small muted', style: 'margin:.75rem 0 0;white-space:pre-wrap' }, company.notes) : null),
        h('section', { class: 'card' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Contacts'), btn('Add', addContact, 'quiet sm', 'plus')),
          contacts.length ? h('div', { class: 'list' }, contacts.map((ct) => h('div', { class: 'small' }, h('b', {}, ct.full_name), ct.title ? h('span', { class: 'muted' }, ' · ' + ct.title) : null, h('div', { class: 'xs' }, ct.email ? h('a', { href: `mailto:${ct.email}` }, ct.email) : null, ct.phone ? h('span', { class: 'muted' }, '  ' + ct.phone) : null)))) : h('p', { class: 'muted small' }, 'No contacts yet.')),
        h('section', { class: 'card' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Open opportunities'), btn('Add', addDeal, 'quiet sm', 'plus')),
          open.length ? h('div', { class: 'list' }, open.map((d) => h('div', { class: 'row small' }, h('span', { class: 'grow ellipsis' }, d.title), statusBadge(STAGES, d.stage, stageTone), h('span', { class: 'mono xs' }, fmtMoney(d.value))))) : h('p', { class: 'muted small' }, 'None open.')))));
  }
  if (tab === 'contacts') {
    c.append(h('div', { class: 'toolbar' }, h('div', { class: 'grow' }), btn('Add contact', addContact, '', 'plus')),
      table([{ label: 'Name', render: (r) => h('b', {}, r.full_name) }, { label: 'Title', key: 'title' }, { label: 'Email', render: (r) => r.email ? h('a', { href: `mailto:${r.email}` }, r.email) : '—' }, { label: 'Phone', key: 'phone' },
        { label: '', cls: 'actions', render: (r) => r.email && !users.some((u) => u.email === r.email.toLowerCase()) ? btn('Create portal login', () => newLoginDialog({ companies: [company], companyId: id, contact: r, onDone: reload }), 'ghost sm', 'key') : (users.some((u) => u.email === r.email?.toLowerCase()) ? h('span', { class: 'badge ok' }, 'Has login') : null) }],
        contacts, { onRow: (r) => editDialog({ title: 'Edit contact', specs: contactSpecs, values: r, onSave: async (v) => { await q(sb.from('contacts').update(v).eq('id', r.id)); reload(); }, onDelete: async () => { await q(sb.from('contacts').delete().eq('id', r.id)); reload(); } }), empty: emptyState('No contacts', 'Add the people you work with at this company.', btn('Add contact', addContact)) }));
  }
  if (tab === 'deals') {
    c.append(h('div', { class: 'toolbar' }, h('div', { class: 'grow' }), btn('New opportunity', addDeal, '', 'plus')), dealTable(deals, st, null, reload, emptyState('No opportunities', 'Track studies, build quotes and POs here.', btn('New opportunity', addDeal))));
  }
  if (tab === 'projects') {
    c.append(h('div', { class: 'toolbar' }, h('span', { class: 'muted small' }, 'Projects marked visible appear in the customer portal with their status and description.'), h('div', { class: 'grow' }), btn('New project', addProject, '', 'plus')), projectTable(projects, null, reload, emptyState('No projects', 'Create a project when a study or build PO arrives.', btn('New project', addProject))));
  }
  if (tab === 'documents') {
    c.append(docLibrary({ docs, projects, staff: true, onChange: reload, uploadBtn: () => btn('Upload files', () => uploadDialog({ companyId: id, projects, staff: true, onDone: reload }), '', 'upload') }));
  }
  if (tab === 'messages') {
    c.append(h('p', { class: 'muted small', style: 'margin:0 0 1rem' }, users.length ? 'This thread is the customer\'s portal conversation and the record of all communication with them. Internal notes stay staff-only.' : 'No one at this company has a portal login yet, so they can\'t see this thread. Create one in Portal logins.'));
    c.append(await threadView({ companyId: id, projects, me, staff: true, staffIds: new Set(st.map((s) => s.id)), onChange: () => { reload(); } }));
    refreshCounts();
  }
  if (tab === 'portal') {
    c.append(h('div', { class: 'toolbar' }, h('span', { class: 'muted small' }, 'People here can sign in and see only this company\'s visible projects, shared documents and messages.'), h('div', { class: 'grow' }), btn('Create portal login', () => newLoginDialog({ companies: [company], companyId: id, onDone: reload }), '', 'key')),
      userTable(users, [company], reload, emptyState('No portal logins', 'Create one so this customer can see shared files and project status.', btn('Create portal login', () => newLoginDialog({ companies: [company], companyId: id, onDone: reload })))));
  }
};

function dealTable(deals, st, companies, reload, empty) {
  const cname = (id) => companies?.find((c) => c.id === id)?.name;
  return table([
    { label: 'Opportunity', render: (d) => h('div', {}, h('b', {}, d.title), companies ? h('div', { class: 'xs muted' }, cname(d.company_id) || '') : null) },
    { label: 'Stage', render: (d) => statusBadge(STAGES, d.stage, stageTone) },
    { label: 'Value', render: (d) => h('span', { class: 'mono small' }, fmtMoney(d.value)) },
    { label: 'Close', render: (d) => h('span', { class: 'small muted' }, fmtDate(d.close_date)) },
    { label: 'Owner', render: (d) => h('span', { class: 'small' }, nameOf(st, d.owner_id)) },
  ], deals, { onRow: (d) => editDeal(d, st, companies, reload), empty });
}
function editDeal(d, st, companies, reload) {
  editDialog({ title: 'Opportunity', specs: dealSpecs(companies, st), values: d, extra: entryFiles({ link: { deal_id: d.id }, companyId: d.company_id, label: 'this opportunity' }), onSave: async (v) => { await q(sb.from('deals').update({ ...v, updated_at: new Date().toISOString() }).eq('id', d.id)); reload(); }, onDelete: async () => { await q(sb.from('deals').delete().eq('id', d.id)); reload(); } });
}
function projectTable(projects, companies, reload, empty) {
  const cname = (id) => companies?.find((c) => c.id === id)?.name;
  return table([
    { label: 'Project', render: (p) => h('div', {}, h('b', {}, p.name), companies ? h('div', { class: 'xs muted' }, cname(p.company_id)) : null) },
    { label: 'Status', render: (p) => statusBadge(PROJECT_STATUS, p.status, { delivered: 'ok', on_hold: 'warn', build: 'accent', test: 'accent', design: 'accent' }) },
    { label: 'PO', render: (p) => h('span', { class: 'mono small' }, p.po_number || '—') },
    { label: 'Target', render: (p) => h('span', { class: 'small muted' }, fmtDate(p.due_date)) },
    { label: 'Portal', render: (p) => p.visible_to_customer ? h('span', { class: 'badge ok' }, 'Visible') : h('span', { class: 'badge' }, 'Hidden') },
  ], projects, { onRow: (p) => editDialog({ title: 'Edit project', specs: projectSpecs(companies), values: p, extra: entryFiles({ link: { project_id: p.id }, companyId: p.company_id, projectId: p.id, label: 'this project' }), onSave: async (v) => { await q(sb.from('projects').update(v).eq('id', p.id)); reload(); }, onDelete: async () => { await q(sb.from('projects').delete().eq('id', p.id)); reload(); } }), empty });
}
function userTable(users, companies, reload, empty) {
  const cname = (id) => companies.find((c) => c.id === id)?.name || '—';
  return table([
    { label: 'Name', render: (u) => h('div', {}, h('b', {}, u.full_name || '—'), h('div', { class: 'xs muted' }, u.email)) },
    { label: 'Access', render: (u) => u.is_superadmin ? h('span', { class: 'badge accent' }, 'super admin') : h('span', { class: 'badge ' + (u.role === 'admin' ? 'accent' : u.role === 'employee' ? 'ok' : '') }, u.role) },
    { label: 'Company', render: (u) => h('span', { class: 'small' }, u.role === 'customer' ? cname(u.company_id) : 'Stratabench') },
    { label: 'Status', render: (u) => u.disabled ? h('span', { class: 'badge bad' }, 'Disabled') : u.must_change_password ? h('span', { class: 'badge warn' }, 'Temp password') : h('span', { class: 'badge ok' }, 'Active') },
    { label: '', cls: 'actions', render: (u) => (u.id === me.id || (!isAdmin && u.role !== 'customer') || (u.is_superadmin && !isSuper)) ? null : h('span', {},
      btn('Reset password', async () => { try { const r = await adminUsers({ action: 'reset_password', user_id: u.id }); credentialsDialog(u.email, r.temp_password, false); reload(); } catch (e) { toast(e.message, true); } }, 'ghost sm'), ' ',
      btn(u.disabled ? 'Enable' : 'Disable', async () => { if (!u.disabled && !(await confirmDialog('Disable login?', `${u.email} will be signed out and unable to sign in.`, 'Disable'))) return; try { await adminUsers({ action: 'update', user_id: u.id, disabled: !u.disabled }); toast(u.disabled ? 'Enabled.' : 'Disabled.'); reload(); } catch (e) { toast(e.message, true); } }, 'quiet sm')) },
  ], users, { onRow: isAdmin ? (u) => {
    if (u.id === me.id) return;
    if (u.is_superadmin && !isSuper) { toast('Only a super admin can change this account.', true); return; }
    editDialog({ title: 'Edit login', specs: [{ name: 'full_name', label: 'Name' }, { name: 'title', label: 'Title' }, { name: 'email', label: 'Email (sign-in)', type: 'email', full: true }, { name: 'role', label: 'Access', type: 'select', options: { customer: 'Customer', employee: 'Employee', admin: 'Admin' } }, { name: 'company_id', label: 'Customer company', type: 'select', options: Object.fromEntries([['', '— none —'], ...companies.map((c) => [c.id, c.name])]) },
      ...(isSuper ? [{ name: 'is_superadmin', label: 'Super admin (sees the Monitor activity log; other admins cannot change this account)', type: 'checkbox', full: true }] : [])], values: u,
      onSave: async (v) => { const payload = { action: 'update', user_id: u.id, full_name: v.full_name, title: v.title, role: v.role, company_id: v.company_id };
        if (isSuper && !!v.is_superadmin !== !!u.is_superadmin) payload.is_superadmin = !!v.is_superadmin; if (v.email && v.email !== u.email) payload.email = v.email; await adminUsers(payload); staffCache = null; toast('Saved.'); reload(); } });
  } : null, empty });
}

views.pipeline = async () => {
  const [deals, companies, st, dealFiles] = await Promise.all([all('deals'), all('companies', 'id,name', 'name', true), staff(), attachmentCounts('deal_id')]);
  const reload = () => route();
  const add = () => editDialog({ title: 'New opportunity', specs: dealSpecs(companies, st), values: { stage: 'lead', owner_id: me.id }, onSave: async (v) => { if (!v.company_id) { toast('Choose a company.', true); throw new Error('company'); } await q(sb.from('deals').insert(v)); reload(); } });
  ui.set('Pipeline', { active: 'pipeline', actions: [btn('New opportunity', add, '', 'plus')] });
  const cname = (id) => companies.find((c) => c.id === id)?.name || '';
  const board = h('div', { class: 'board' });
  for (const [stage, label] of Object.entries(STAGES)) {
    const items = deals.filter((d) => d.stage === stage);
    const col = h('section', { class: 'col', dataset: { stage }, 'aria-label': label },
      h('div', { class: 'col-head' }, h('b', {}, label), h('span', {}, `${items.length} · ${fmtMoney(items.reduce((a, d) => a + (Number(d.value) || 0), 0))}`)),
      ...items.map((d) => {
        const card = h('div', { class: 'deal', draggable: 'true', tabindex: 0, dataset: { id: d.id } }, h('b', {}, d.title), h('div', { class: 'xs muted' }, cname(d.company_id)), h('div', { class: 'row xs', style: 'margin-top:.35rem' }, h('span', { class: 'mono grow' }, fmtMoney(d.value)), clipBadge(dealFiles[d.id]), h('span', { class: 'muted' }, d.close_date ? fmtDate(d.close_date) : '')));
        fileDropTarget(card, { link: { deal_id: d.id }, companyId: d.company_id, label: d.title }, reload);
        card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', d.id); card.classList.add('dragging'); });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        card.addEventListener('click', () => editDeal(d, st, companies, reload));
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter') editDeal(d, st, companies, reload); });
        return card;
      }));
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault(); col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain'); const d = deals.find((x) => x.id === id);
      if (!d || d.stage === stage) return;
      await q(sb.from('deals').update({ stage, updated_at: new Date().toISOString() }).eq('id', id));
      toast(`Moved to ${label}.`); reload();
    });
    board.append(col);
  }
  ui.content.append(h('p', { class: 'muted small', style: 'margin:0 0 1rem' }, 'Drag cards between stages. Click a card to edit it or see its files. Drop files from your computer straight onto a card to attach them.'), board);
};

views.projects = async () => {
  const [projects, companies] = await Promise.all([all('projects'), all('companies', 'id,name,kind', 'name', true)]);
  const reload = () => route();
  const add = () => editDialog({ title: 'New project', specs: projectSpecs(companies), values: { status: 'study', visible_to_customer: true }, onSave: async (v) => { if (!v.company_id) { toast('Choose a company.', true); throw new Error('company'); } await q(sb.from('projects').insert(v)); reload(); } });
  ui.set('Projects', { active: 'projects', actions: [btn('New project', add, '', 'plus')] });
  ui.content.append(projectTable(projects, companies, reload, emptyState('No projects yet', 'Create a project when a study or build PO arrives.', btn('New project', add))));
};

views.documents = async () => {
  const [docs, projects, companies] = await Promise.all([all('documents'), all('projects', 'id,name,company_id'), all('companies', 'id,name', 'name', true)]);
  const reload = () => route();
  const up = () => btn('Upload files', () => uploadDialog({ companyId: null, companies, projects, staff: true, onDone: reload }), '', 'upload');
  ui.set('Documents', { active: 'documents' });
  const total = docs.reduce((a, d) => a + (Number(d.size_bytes) || 0), 0);
  ui.content.append(h('p', { class: 'muted small', style: 'margin:0 0 1rem' }, `${docs.length} files · ${fmtBytes(total)} stored. Files with no company are in the internal library and visible to staff only. Customer-company files appear in that customer's portal only when Visibility is set to Shared.`),
    docLibrary({ docs, projects, companies, staff: true, onChange: reload, uploadBtn: up }));
};

views.tasks = async (params) => {
  const show = params.get('show') || 'open';
  const [tasks, companies, taskFiles] = await Promise.all([q(sb.from('activities').select('*').eq('kind', 'task').order('due_at', { ascending: true, nullsFirst: false })), all('companies', 'id,name', 'name', true), attachmentCounts('activity_id')]);
  const reload = () => route();
  const add = () => editDialog({ title: 'New task', specs: taskSpecs(companies), onSave: async (v) => { await q(sb.from('activities').insert({ kind: 'task', body: v.body, due_at: fromLocalInput(v.due_at), company_id: v.company_id || null })); refreshCounts(); reload(); } });
  ui.set('Tasks', { active: 'tasks', actions: [btn('New task', add, '', 'plus')] });
  const cname = (id) => companies.find((c) => c.id === id)?.name;
  const rows = tasks.filter((t) => show === 'all' || (show === 'open' ? !t.done : t.done));
  ui.content.append(h('div', { class: 'subtabs' }, ...[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => h('button', { 'aria-selected': String(k === show), onclick: () => { location.hash = `#/tasks?show=${k}`; } }, l))),
    h('div', { class: 'card' }, rows.length ? h('div', { class: 'list' }, rows.map((t) => taskRow(t, cname, reload, taskFiles[t.id]))) : emptyState(show === 'open' ? 'All caught up' : 'Nothing here', 'Tasks created from website inquiries and company pages appear here.', show === 'open' ? btn('New task', add) : null)));
  refreshCounts();
};

views.team = async () => {
  const [users, companies] = await Promise.all([q(sb.from('profiles').select('*').order('role').order('full_name')), all('companies', 'id,name', 'name', true)]);
  const reload = () => route();
  ui.set(isAdmin ? 'Users & access' : 'Customer logins', { active: 'team', actions: [btn('Create login', () => newLoginDialog({ companies, onDone: reload }), '', 'key')] });
  const staffU = users.filter((u) => u.role !== 'customer'); const cust = users.filter((u) => u.role === 'customer');
  ui.content.append(
    h('div', { class: 'card', style: 'margin-bottom:1rem' }, h('h2', {}, 'How access works'), h('ul', { class: 'small muted', style: 'margin:0;padding-left:1.1rem;display:grid;gap:.25rem' },
      h('li', {}, 'Customers see only their own company\'s visible projects, shared documents and non-internal messages. The database enforces this, not just the screen.'),
      h('li', {}, 'Employees use the CRM and can create customer logins. Admins can also create employees and admins.'),
      isSuper ? h('li', {}, 'Super admins can see the Monitor log of every sign-in, file view, download and change. Other admins cannot change or reset a super admin account.') : null,
      h('li', {}, 'New logins get a one-time temporary password and must set their own at first sign-in. There is no public sign-up.'))),
    h('h2', { class: 'small mono muted', style: 'letter-spacing:.08em;text-transform:uppercase;margin:1.25rem 0 .6rem' }, 'Stratabench team'),
    userTable(staffU, companies, reload),
    h('h2', { class: 'small mono muted', style: 'letter-spacing:.08em;text-transform:uppercase;margin:1.5rem 0 .6rem' }, 'Customer logins'),
    userTable(cust, companies, reload, emptyState('No customer logins yet', 'Create one from a company\'s Portal logins tab or with the button above.')));
};


/* ---------- super admin monitor ---------- */
const ENTITY_LABEL = { companies: 'Company', contacts: 'Contact', deals: 'Opportunity', projects: 'Project', documents: 'File', messages: 'Message', inquiries: 'Website inquiry', activities: 'Note / task', profiles: 'Login', login: 'Login', session: 'Session' };
const ACTION_LABEL = { insert: 'created', update: 'updated', delete: 'deleted', sign_in: 'signed in', sign_out: 'signed out', view: 'viewed', download: 'downloaded', password_reset: 'reset password for', access_change: 'changed access for', login_created: 'created login', password_changed: 'changed password', notifications_on: 'turned on notifications', notifications_off: 'turned off notifications' };
const actTone = { delete: 'bad', sign_in: 'ok', download: 'accent', view: 'accent', access_change: 'warn', password_reset: 'warn' };
function describe(e) {
  const ent = ENTITY_LABEL[e.entity] || e.entity;
  if (e.action === 'sign_in') return `Signed in (${e.label || 'browser'})`;
  if (e.entity === 'messages' && e.action === 'insert') return `${e.details?.internal ? 'Internal note' : 'Message'}: ${e.label || ''}`;
  const verb = ACTION_LABEL[e.action] || e.action;
  return `${verb[0].toUpperCase() + verb.slice(1)} ${ent.toLowerCase()}${e.label ? ': ' + e.label : ''}`;
}
function changeList(d) {
  if (!d) return null;
  const parts = Object.entries(d).filter(([k]) => !['ua'].includes(k)).map(([k, v]) => v && typeof v === 'object' && 'from' in v ? `${k.replace(/_/g, ' ')}: ${fmtVal(v.from)} → ${fmtVal(v.to)}` : v && v.changed ? `${k.replace(/_/g, ' ')} edited` : null).filter(Boolean);
  return parts.length ? h('div', { class: 'xs muted', style: 'margin-top:.2rem' }, parts.join(' · ')) : null;
}
const fmtVal = (v) => v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v).length > 40 ? String(v).slice(0, 40) + '…' : String(v);

views.monitor = async (params) => {
  if (!isSuper) { location.hash = '#/dashboard'; return; }
  const tab = params.get('tab') || 'activity';
  ui.set('Monitor', { active: 'monitor' });
  ui.content.append(h('div', { class: 'subtabs', role: 'tablist' }, [['activity', 'Activity log'], ['people', 'People'], ['storage', 'Storage']].map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(k === tab), onclick: () => { location.hash = `#/monitor?tab=${k}`; } }, l))));
  const c = ui.content;
  if (tab === 'activity') {
    const [people, companies] = await Promise.all([q(sb.from('profiles').select('id,full_name,email,role').order('full_name')), all('companies', 'id,name', 'name', true)]);
    const cname = Object.fromEntries(companies.map((x) => [x.id, x.name]));
    const who = h('select', { class: 'input', style: 'width:auto', 'aria-label': 'Person' }, h('option', { value: '' }, 'Everyone'), h('option', { value: 'staff' }, 'Staff only'), h('option', { value: 'customer' }, 'Customers only'), h('option', { value: 'system' }, 'Website / system'), people.map((p) => h('option', { value: p.id }, `${p.full_name || p.email} (${p.role})`)));
    const kind = h('select', { class: 'input', style: 'width:auto', 'aria-label': 'Type' }, h('option', { value: '' }, 'All activity'), [['sign_in', 'Sign-ins'], ['files', 'File views & downloads'], ['documents', 'File uploads & changes'], ['messages', 'Messages'], ['deals', 'Opportunities'], ['projects', 'Projects'], ['inquiries', 'Website inquiries'], ['activities', 'Notes & tasks'], ['companies', 'Companies & contacts'], ['access', 'Logins & access'], ['delete', 'Deletions']].map(([k, l]) => h('option', { value: k }, l)));
    if (params.get('who')) { who.value = params.get('who'); }
    const comp = h('select', { class: 'input', style: 'width:auto', 'aria-label': 'Company' }, h('option', { value: '' }, 'All companies'), companies.map((x) => h('option', { value: x.id }, x.name)));
    const since = h('select', { class: 'input', style: 'width:auto', 'aria-label': 'Period' }, [['1', 'Last 24 hours'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['365', 'Last year'], ['', 'All time']].map(([k, l]) => h('option', { value: k, selected: k === (params.get('who') ? '30' : '7') }, l)));
    const search = h('input', { class: 'input search', type: 'search', placeholder: 'Search log', 'aria-label': 'Search log' });
    const holder = h('div'); const more = h('div', { style: 'margin-top:1rem;text-align:center' });
    let rows = []; let page = 0; const PAGE = 100;
    const load = async (reset = true) => {
      if (reset) { page = 0; rows = []; holder.replaceChildren(loading()); }
      let qq = sb.from('audit_log').select('*').order('at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (who.value === 'staff') qq = qq.in('actor_role', ['employee', 'admin']); else if (who.value === 'customer') qq = qq.eq('actor_role', 'customer'); else if (who.value === 'system') qq = qq.is('actor_id', null); else if (who.value) qq = qq.eq('actor_id', who.value);
      const k = kind.value;
      if (k === 'sign_in') qq = qq.eq('action', 'sign_in'); else if (k === 'files') qq = qq.in('action', ['view', 'download']); else if (k === 'documents') qq = qq.eq('entity', 'documents').in('action', ['insert', 'update', 'delete']);
      else if (k === 'companies') qq = qq.in('entity', ['companies', 'contacts']); else if (k === 'access') qq = qq.in('entity', ['profiles', 'login']); else if (k === 'delete') qq = qq.eq('action', 'delete'); else if (k) qq = qq.eq('entity', k);
      if (comp.value) qq = qq.eq('company_id', comp.value);
      if (since.value) qq = qq.gte('at', new Date(Date.now() - Number(since.value) * 864e5).toISOString());
      if (search.value.trim()) { const t = search.value.trim().replace(/[%,()]/g, ' '); qq = qq.or(`label.ilike.%${t}%,actor_name.ilike.%${t}%`); }
      const data = await q(qq);
      rows.push(...data); page++;
      holder.replaceChildren(rows.length ? h('div', { class: 'card', style: 'padding:0' }, h('div', { class: 'list audit' }, rows.map((e) => h('div', { class: 'row', style: 'align-items:flex-start;padding:.7rem 1rem;gap:.75rem' },
        h('span', { class: 'xs muted mono', style: 'white-space:nowrap;min-width:6.5rem', title: new Date(e.at).toLocaleString() }, fmtDateTime(e.at)),
        h('div', { class: 'grow', style: 'min-width:0' },
          h('div', { class: 'small' }, h('b', {}, e.actor_name || 'System'), e.actor_role ? h('span', { class: 'xs muted' }, ` · ${e.actor_role}`) : null),
          h('div', { class: 'small', style: 'overflow-wrap:anywhere' }, describe(e)),
          changeList(e.details),
          e.company_id && cname[e.company_id] ? h('a', { class: 'xs', href: `#/company/${e.company_id}` }, cname[e.company_id]) : null),
        h('span', { class: 'badge ' + (actTone[e.action] || '') }, ENTITY_LABEL[e.entity] || e.entity))))) : emptyState('Nothing in this view', 'Try a wider period or clear the filters.'));
      more.replaceChildren(data.length === PAGE ? btn('Load more', () => load(false), 'ghost') : '');
    };
    [who, kind, comp, since].forEach((el) => el.addEventListener('change', () => load()));
    let t; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => load(), 350); });
    c.append(h('p', { class: 'muted small', style: 'margin:0 0 1rem' }, 'Every sign-in, file view, download, upload, message and record change across the CRM and customer portal. Only super admins can see this log, and no one can edit or delete it from the app.'),
      h('div', { class: 'toolbar', style: 'flex-wrap:wrap' }, search, who, kind, comp, since), holder, more);
    await load();
  }
  if (tab === 'people') {
    const ppl = await q(sb.rpc('monitor_people'));
    const now = Date.now();
    const active7 = ppl.filter((p) => p.last_sign_in_at && now - new Date(p.last_sign_in_at) < 7 * 864e5).length;
    c.append(h('div', { class: 'stats', style: 'margin-bottom:1rem' },
      ...[['Logins', ppl.length], ['Signed in, last 7 days', active7], ['Never signed in', ppl.filter((p) => !p.last_sign_in_at).length], ['Devices with notifications', ppl.reduce((a, p) => a + Number(p.devices || 0), 0)]].map(([l, v]) => h('div', { class: 'stat card' }, h('span', { class: 'xs muted' }, l), h('b', { class: 'tnum' }, String(v))))),
      table([
        { label: 'Person', render: (p) => h('div', {}, h('b', {}, p.full_name || '—'), h('div', { class: 'xs muted' }, p.email)) },
        { label: 'Access', render: (p) => h('span', { class: 'badge ' + (p.is_superadmin || p.role === 'admin' ? 'accent' : p.role === 'employee' ? 'ok' : '') }, p.is_superadmin ? 'super admin' : p.role) },
        { label: 'Company', render: (p) => h('span', { class: 'small' }, p.role === 'customer' ? (p.company_name || '—') : 'Stratabench') },
        { label: 'Last sign-in', render: (p) => h('span', { class: 'small', title: p.last_sign_in_at ? new Date(p.last_sign_in_at).toLocaleString() : '' }, p.last_sign_in_at ? ago(p.last_sign_in_at) : h('span', { class: 'muted' }, 'Never')) },
        { label: 'Last activity', render: (p) => h('span', { class: 'small muted' }, p.last_activity_at ? ago(p.last_activity_at) : '—') },
        { label: 'Actions (7d)', render: (p) => h('span', { class: 'mono small' }, String(p.actions_7d)) },
        { label: 'Alerts', render: (p) => Number(p.devices) ? h('span', { class: 'badge ok' }, `${p.devices} device${p.devices > 1 ? 's' : ''}`) : h('span', { class: 'badge' }, 'Off') },
        { label: 'Status', render: (p) => p.disabled ? h('span', { class: 'badge bad' }, 'Disabled') : p.must_change_password ? h('span', { class: 'badge warn' }, 'Temp password') : h('span', { class: 'badge ok' }, 'Active') },
      ], ppl, { onRow: (p) => { location.hash = `#/monitor?tab=activity&who=${p.id}`; } }));
  }
  if (tab === 'storage') {
    const rows = await q(sb.rpc('monitor_storage'));
    const total = rows.reduce((a, r) => a + Number(r.bytes || 0), 0);
    c.append(h('div', { class: 'stats', style: 'margin-bottom:1rem' },
      ...[['Files stored', rows.reduce((a, r) => a + Number(r.files), 0)], ['Total size', fmtBytes(total)], ['Shared with customers', rows.reduce((a, r) => a + Number(r.shared), 0)]].map(([l, v]) => h('div', { class: 'stat card' }, h('span', { class: 'xs muted' }, l), h('b', { class: 'tnum' }, String(v))))),
      table([
        { label: 'Company', render: (r) => h('b', {}, r.company_name) },
        { label: 'Files', render: (r) => h('span', { class: 'mono small' }, String(r.files)) },
        { label: 'Shared', render: (r) => h('span', { class: 'mono small' }, String(r.shared)) },
        { label: 'Size', render: (r) => h('span', { class: 'mono small' }, fmtBytes(r.bytes)) },
        { label: 'Last upload', render: (r) => h('span', { class: 'small muted' }, ago(r.last_upload)) },
      ], rows, { onRow: (r) => { location.hash = r.company_id ? `#/company/${r.company_id}?tab=documents` : '#/documents'; }, empty: emptyState('No files yet', '') }),
      h('p', { class: 'muted xs', style: 'margin-top:1rem' }, 'Sizes come from the file records. The billed storage figure is in the Supabase dashboard under Usage.'));
  }
};

/* ---------- router ---------- */
async function route() {
  const [path, qs] = (location.hash.slice(2) || 'dashboard').split('?');
  const [view, id] = path.split('/');
  const params = new URLSearchParams(qs || '');
  try { await (views[view] || views.dashboard)(params, id); } catch (e) { if (e.message !== 'redirect') { console.error(e); ui.content.append(emptyState('Something went wrong', e.message || String(e))); } }
}
window.addEventListener('hashchange', route);
route(); refreshCounts();
import('./notify.js').then((n) => n.boot(me)).catch(() => {});
