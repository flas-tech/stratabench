import { sb, h, icon, fmtBytes, ago, fileBadge, fileKind, openDoc, downloadDoc, toast, modal, confirmDialog, uploadFile, newPath, progressRow, ext } from './core.js';
import { BUCKET } from './config.js';
import { postFileNote } from './thread.js';

const CAD = ['step', 'stp', 'iges', 'igs', 'brep', 'stl', 'obj', 'gltf', 'glb', '3mf', 'ply', 'sldprt', 'sldasm', 'ipt', 'iam', 'catpart', 'catproduct', 'prt', 'asm', 'f3d', 'x_t', 'x_b', 'jt'];
/** Best-guess category from the file name so attaching is one step. Can be changed later in Documents. */
export function guessCategory(name) {
  const n = name.toLowerCase(); const e = ext(name);
  if (CAD.includes(e)) return 'cad';
  if (['dwg', 'dxf', 'slddrw'].includes(e) || /\bdrawing|\bdwg\b|schematic|p&id|pid\b/.test(n)) return 'drawing';
  if (/\bpo\b|purchase.?order/.test(n)) return 'po';
  if (/quote|proposal|estimate/.test(n)) return 'quote';
  if (/cal(ibration)?.?cert|certificate|17025|nist/.test(n)) return 'cal_cert';
  if (/\bcmm\b|\batp\b|spec|requirement|\brfq\b|sow/.test(n)) return 'requirement';
  if (['csv', 'tdms', 'log', 'xlsx', 'xls'].includes(e) || /test.?data|results|run\d/.test(n)) return 'test_data';
  if (/manual|o&m|\bom\b/.test(n)) return 'manual';
  if (/report/.test(n)) return 'report';
  return 'other';
}

/** Upload a list of files and link them to a CRM entry. Returns inserted rows. */
export async function attachFiles(files, { link = {}, companyId = null, projectId = null, share = false, listEl = null }) {
  const rows = [];
  for (const file of files) {
    const pr = progressRow(file); listEl?.append(pr.row);
    try {
      const path = newPath(companyId || 'internal', file.name || 'pasted-image.png');
      await uploadFile(file, path, pr.set);
      const { data: row, error } = await sb.from('documents').insert({
        company_id: companyId, project_id: projectId || link.project_id || null, deal_id: link.deal_id || null, inquiry_id: link.inquiry_id || null, activity_id: link.activity_id || null,
        name: file.name || 'pasted-image.png', category: guessCategory(file.name || ''), storage_path: path, size_bytes: file.size, mime: file.type || null,
        shared_with_customer: !!companyId && share,
      }).select('*').single();
      if (error) throw error;
      rows.push(row); pr.done();
    } catch (e) { console.error(e); pr.fail(e.message || String(e)); toast(`${file.name}: ${e.message || 'upload failed'}`, true); }
  }
  const shared = rows.filter((r) => r.company_id && r.shared_with_customer);
  if (shared.length) { try { await postFileNote({ companyId: shared[0].company_id, projectId: shared[0].project_id, docs: shared, staff: true }); } catch (e) { console.warn(e); } }
  return rows;
}

function fileRow(d, onChange) {
  const kind = fileKind(d.name);
  return h('div', { class: 'ef-row' }, fileBadge(d.name),
    h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'small ellipsis', title: d.name, style: 'font-weight:600' }, d.name),
      h('div', { class: 'xs muted' }, [fmtBytes(d.size_bytes), ago(d.created_at), d.company_id ? (d.shared_with_customer ? 'Shared with customer' : 'Internal') : 'Staff only'].join(' · '))),
    kind !== 'other' ? h('button', { class: 'btn quiet sm', type: 'button', title: kind === '3d' ? '3D view' : 'View', 'aria-label': `View ${d.name}`, onclick: () => openDoc(d) }, icon(kind === '3d' ? 'cube' : 'eye')) : null,
    h('button', { class: 'btn quiet sm', type: 'button', title: 'Download', 'aria-label': `Download ${d.name}`, onclick: () => downloadDoc(d) }, icon('download')),
    h('button', { class: 'btn quiet sm', type: 'button', title: 'Remove', 'aria-label': `Delete ${d.name}`, onclick: async () => {
      if (!(await confirmDialog('Delete file?', `"${d.name}" will be permanently removed${d.shared_with_customer ? ', including from the customer portal' : ''}.`))) return;
      await sb.storage.from(BUCKET).remove([d.storage_path]);
      const { error } = await sb.from('documents').delete().eq('id', d.id);
      if (error) return toast(error.message, true);
      toast('File deleted.'); onChange?.();
    } }, icon('trash')));
}

/**
 * Drop-in "Files" section for any entry (inquiry, opportunity, project, note/task).
 * Drop, click/tap, or paste a screenshot. Files upload immediately.
 */
export function entryFiles({ link, companyId = null, projectId = null, label = 'this entry', onChange }) {
  const [col, id] = Object.entries(link)[0];
  const list = h('div', { class: 'ef-list' });
  const progress = h('div', { class: 'up-list' });
  const countEl = h('span', { class: 'muted xs' });
  const shareCb = h('input', { type: 'checkbox' });
  const input = h('input', { type: 'file', multiple: true, class: 'hidden' });
  const zone = h('div', { class: 'drop ef-drop', tabindex: 0, role: 'button', 'aria-label': `Attach files to ${label}` },
    icon('upload'), h('span', {}, h('b', {}, 'Drop files'), ', tap to choose, or paste a screenshot'));
  let busy = false;
  const load = async () => {
    const { data, error } = await sb.from('documents').select('*').eq(col, id).order('created_at', { ascending: false });
    if (error) { list.replaceChildren(h('p', { class: 'xs muted' }, error.message)); return; }
    countEl.textContent = data.length ? `${data.length} file${data.length > 1 ? 's' : ''}` : '';
    list.replaceChildren(...(data.length ? data.map((d) => fileRow(d, () => { load(); onChange?.(); })) : [h('p', { class: 'xs muted', style: 'margin:0' }, 'No files attached yet.')]));
  };
  const go = async (files) => {
    if (!files.length) return;
    if (busy) return toast('Uploads in progress. Add more when they finish.', true);
    busy = true; section.dataset.busy = '1';
    const rows = await attachFiles(files, { link, companyId, projectId, share: shareCb.checked, listEl: progress });
    busy = false; delete section.dataset.busy;
    if (rows.length) { toast(`${rows.length} file${rows.length > 1 ? 's' : ''} attached.`); setTimeout(() => progress.replaceChildren(), 1500); }
    load(); onChange?.();
  };
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); go([...e.dataTransfer.files]); });
  input.addEventListener('change', () => { go([...input.files]); input.value = ''; });
  const onPaste = (e) => {
    if (!section.isConnected) { document.removeEventListener('paste', onPaste); return; }
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    go(files.map((f, i) => f.name && f.name !== 'image.png' ? f : new File([f], `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}${i ? '-' + i : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type })));
  };
  document.addEventListener('paste', onPaste);
  const section = h('section', { class: 'ef', 'aria-label': 'Attached files' },
    h('div', { class: 'row', style: 'gap:.5rem' }, icon('clip'), h('b', { class: 'small' }, 'Files'), countEl, h('div', { class: 'grow' }),
      companyId ? h('label', { class: 'switch xs', title: 'Off keeps new files internal. You can change this per file in Documents.' }, shareCb, 'Share new files with customer') : h('span', { class: 'xs muted' }, 'Staff only until converted')),
    zone, input, progress, list);
  load();
  return section;
}

/** Small modal with just the files for an entry. */
export function filesDialog(opts, title = 'Files') {
  modal({ title, body: entryFiles(opts), wide: true, actions: [{ label: 'Done' }], onClose: () => opts.onClose?.() });
}

/** Count attachments per entry id for a link column. */
export async function attachmentCounts(col) {
  const { data } = await sb.from('documents').select(col).not(col, 'is', null);
  const m = {}; (data || []).forEach((r) => { m[r[col]] = (m[r[col]] || 0) + 1; });
  return m;
}
export const clipBadge = (n) => n ? h('span', { class: 'badge', title: `${n} file${n > 1 ? 's' : ''} attached`, style: 'gap:.2rem' }, icon('clip'), String(n)) : null;

/** Turn the given element into a drop target that attaches files directly. */
export function fileDropTarget(el, opts, after) {
  el.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); e.stopPropagation(); el.classList.add('file-over'); } });
  el.addEventListener('dragleave', () => el.classList.remove('file-over'));
  el.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault(); e.stopPropagation(); el.classList.remove('file-over');
    toast(`Uploading ${e.dataTransfer.files.length} file(s)…`);
    const rows = await attachFiles([...e.dataTransfer.files], opts);
    if (rows.length) toast(`${rows.length} file${rows.length > 1 ? 's' : ''} attached to ${opts.label || 'entry'}.`);
    after?.();
  });
}

/** Fire-and-forget event for the super admin activity log. */
export function logEvent(action, extra = {}) { sb.rpc('log_event', { p_action: action, p_entity: extra.entity || null, p_entity_id: extra.id || null, p_company_id: extra.company_id || null, p_label: extra.label || null, p_details: extra.details || null }).then(() => {}, () => {}); }
