import { sb, h, icon, requireRole, shell, passwordDialog, fmtDate, ago, PROJECT_STATUS, statusBadge, emptyState, loading, btn, toast, fileKind, openDoc } from './core.js';
import { docLibrary, uploadDialog } from './docs.js';
import { threadView, unreadSummary } from './thread.js';

const profile = await requireRole(['customer']);
const ui = shell({ profile, subtitle: 'Project portal', items: [
  { id: 'overview', label: 'Overview', icon: 'dash' },
  { id: 'documents', label: 'Documents', icon: 'folder' },
  { id: 'messages', label: 'Messages', icon: 'msg', count: true },
] });
if (profile.must_change_password) await passwordDialog(profile, true);

const state = { company: null, projects: [], docs: [], messages: [], names: {} };
async function load() {
  const [c, p, d, m] = await Promise.all([
    sb.rpc('my_company_info'),
    sb.from('projects').select('*').order('created_at', { ascending: false }),
    sb.from('documents').select('*').order('created_at', { ascending: false }),
    sb.from('messages').select('*').order('created_at', { ascending: true }),
  ]);
  state.company = c.data?.[0] || null;
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
  async messages() {
    ui.set('Messages', { active: 'messages' });
    if (!profile.company_id) { ui.content.append(emptyState('Your account is not linked to a company yet', 'Contact your Stratabench engineer to finish setting up your portal.')); return; }
    ui.content.append(h('p', { class: 'muted small', style: 'margin:0 0 1rem' }, 'All communication with Stratabench happens here: questions, files, quotes, and project updates. Attach CAD, drawings, or CMM/ATP pages directly to a message.'));
    ui.content.append(await threadView({ companyId: profile.company_id, projects: state.projects, me: profile, staff: false, onChange: async () => { await load(); route(); } }));
    refreshUnread(0);
  },
};

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
