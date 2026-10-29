import { sb, h, icon, ago, fmtBytes, fileKind, openDoc, downloadDoc, toast, emptyState, uploadFile, newPath, progressRow, ext, NATIVE_CAD, btn } from './core.js';

const CAD_EXT = ['step', 'stp', 'iges', 'igs', 'brep', 'stl', 'obj', 'gltf', 'glb', '3mf', 'ply', ...NATIVE_CAD];
export const autoCategory = (name) => CAD_EXT.includes(ext(name)) ? 'cad' : 'other';

/** Mark a company's thread read for the current user. */
export async function markRead(companyId) {
  if (!companyId) return;
  await sb.from('message_reads').upsert({ company_id: companyId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,company_id' });
}
export async function unreadSummary() {
  const { data } = await sb.rpc('unread_threads');
  return data || [];
}

/** Post a message that references uploaded documents (used after uploads). */
export async function postFileNote({ companyId, projectId = null, docs, staff }) {
  if (!companyId || !docs.length) return;
  const list = docs.map((d) => `• ${d.name} (${fmtBytes(d.size_bytes)})`).join('\n');
  const body = `${staff ? 'Shared' : 'Uploaded'} ${docs.length} file${docs.length > 1 ? 's' : ''}:\n${list}`;
  await sb.from('messages').insert({ company_id: companyId, project_id: projectId, body, attachment_ids: docs.map((d) => d.id) });
}

/**
 * Full conversation for one company.
 * opts: { companyId, projects, me, staff, staffIds:Set }
 */
export async function threadView({ companyId, projects = [], me, staff = false, staffIds = new Set(), onChange }) {
  const wrap = h('div', { class: 'card thread-card' });
  const { data: msgs = [] } = await sb.from('messages').select('*').eq('company_id', companyId).order('created_at', { ascending: true });
  const attIds = [...new Set(msgs.flatMap((m) => m.attachment_ids || []))];
  const docs = attIds.length ? ((await sb.from('documents').select('*').in('id', attIds)).data || []) : [];
  const docMap = Object.fromEntries(docs.map((d) => [d.id, d]));
  const names = {};
  await Promise.all([...new Set(msgs.map((m) => m.author_id).filter(Boolean))].map(async (uid) => { const { data } = await sb.rpc('author_name', { uid }); names[uid] = data || '—'; }));
  const projName = (id) => projects.find((p) => p.id === id)?.name;

  const attEl = (d) => {
    const kind = fileKind(d.name);
    return h('div', { class: 'att' }, h('span', { class: 'filetype' }, ext(d.name).toUpperCase().slice(0, 5)),
      h('span', { class: 'ellipsis grow', title: d.name }, d.name), h('span', { class: 'xs muted mono' }, fmtBytes(d.size_bytes)),
      kind !== 'other' ? h('button', { class: 'btn ghost sm', onclick: () => openDoc(d) }, kind === '3d' ? '3D view' : 'View') : null,
      h('button', { class: 'btn quiet sm', 'aria-label': `Download ${d.name}`, onclick: () => downloadDoc(d) }, icon('download')));
  };
  const msgEl = (m) => {
    const mine = m.author_id === me.id;
    const who = mine ? 'You' : (names[m.author_id] || (staff ? 'Customer' : 'Stratabench'));
    const side = staff ? (staffIds.has(m.author_id) ? 'Stratabench' : 'Customer') : null;
    const atts = (m.attachment_ids || []).map((id) => docMap[id]).filter(Boolean);
    const missing = (m.attachment_ids || []).length - atts.length;
    return h('div', { class: 'msg' + (mine ? ' mine' : '') + (m.internal ? ' internal' : '') },
      h('div', { class: 'meta' }, h('b', {}, who), side ? h('span', {}, side) : null, h('span', {}, ago(m.created_at)), m.internal ? h('span', { class: 'badge warn' }, 'Internal note') : null, projName(m.project_id) ? h('span', {}, '· ' + projName(m.project_id)) : null),
      h('p', {}, m.body),
      atts.length ? h('div', { class: 'atts' }, atts.map(attEl)) : null,
      missing > 0 ? h('p', { class: 'xs muted' }, `${missing} attachment${missing > 1 ? 's' : ''} no longer available`) : null);
  };

  const thread = h('div', { class: 'thread', 'aria-live': 'polite' }, msgs.length ? msgs.map(msgEl) : emptyState('No messages yet', staff ? 'Messages you send here appear in the customer\'s portal. This thread is the record of all communication with this customer.' : 'Questions, files, and updates for your project all happen here.'));

  // composer
  const ta = h('textarea', { class: 'input', rows: 3, placeholder: staff ? 'Message the customer…' : 'Write a message to the Stratabench team…', 'aria-label': 'Message' });
  const projSel = h('select', { class: 'input', style: 'width:auto', 'aria-label': 'Project' }, h('option', { value: '' }, 'General'), projects.map((p) => h('option', { value: p.id }, p.name)));
  const internal = staff ? h('input', { type: 'checkbox' }) : null;
  const pending = []; // {file}
  const pendList = h('div', { class: 'up-list' });
  const fileIn = h('input', { type: 'file', multiple: true, class: 'hidden' });
  const renderPending = () => { pendList.innerHTML = ''; pending.forEach((p, i) => { p.pr ||= progressRow(p.file); const rm = h('button', { class: 'btn quiet sm', 'aria-label': `Remove ${p.file.name}`, onclick: () => { pending.splice(i, 1); renderPending(); } }, icon('x')); if (!p.wrap) { const mono = p.pr.row.querySelector('.mono'); p.wrap = h('span', { class: 'row', style: 'gap:.25rem' }); mono.replaceWith(p.wrap); p.wrap.append(mono); } p.wrap.querySelector('button')?.remove(); if (!p.sending) p.wrap.append(rm); pendList.append(p.pr.row); }); };
  fileIn.onchange = () => { [...fileIn.files].forEach((f) => pending.push({ file: f })); fileIn.value = ''; renderPending(); };
  const attachBtn = btn('Attach files', () => fileIn.click(), 'ghost', 'upload');
  const sendBtn = btn('Send', async () => {
    const body = ta.value.trim();
    if (!body && !pending.length) return;
    if (internal?.checked && pending.length) { toast('Internal notes can\'t carry attachments. Upload to Documents instead.', true); return; }
    sendBtn.disabled = true; attachBtn.disabled = true;
    try {
      const ids = [];
      for (const p of pending) {
        p.sending = true;
        const path = newPath(companyId, p.file.name);
        await uploadFile(p.file, path, p.pr.set);
        const { data, error } = await sb.from('documents').insert({ company_id: companyId, project_id: projSel.value || null, name: p.file.name, category: autoCategory(p.file.name), storage_path: path, size_bytes: p.file.size, mime: p.file.type || null, shared_with_customer: true, description: 'Sent with a message' }).select('id').single();
        if (error) throw error; ids.push(data.id); p.pr.done();
      }
      const { error } = await sb.from('messages').insert({ company_id: companyId, project_id: projSel.value || null, body: body || `Sent ${ids.length} file${ids.length > 1 ? 's' : ''}.`, internal: !!internal?.checked, attachment_ids: ids });
      if (error) throw error;
      toast(internal?.checked ? 'Internal note saved.' : staff ? 'Sent to the customer portal.' : 'Message sent.');
      onChange?.();
    } catch (e) { toast(e.message || String(e), true); sendBtn.disabled = false; attachBtn.disabled = false; }
  }, '', null);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendBtn.click(); });

  wrap.append(thread, h('div', { class: 'composer' }, ta, pendList,
    h('div', { class: 'row', style: 'flex-wrap:wrap' }, attachBtn, fileIn, h('span', { class: 'muted xs' }, 'About'), projSel,
      internal ? h('label', { class: 'switch' }, internal, 'Internal note (staff only)') : null, h('div', { class: 'grow' }), h('span', { class: 'xs muted hide-sm' }, 'Ctrl/⌘ + Enter to send'), sendBtn)));
  requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
  markRead(companyId);
  return wrap;
}
