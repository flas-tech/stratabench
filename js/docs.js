import { sb, h, icon, fmtBytes, fmtDate, CATEGORIES, CUSTOMER_UPLOAD_CATS, fileBadge, fileKind, openDoc, downloadDoc, toast, modal, confirmDialog, dropZone, progressRow, uploadFile, newPath, emptyState } from './core.js';
import { BUCKET } from './config.js';
import { postFileNote } from './thread.js';

/**
 * Renders a filterable document library.
 * opts: { docs, projects, companies?, staff, onChange, onUpload? }
 */
export function docLibrary({ docs, projects = [], companies = null, staff = false, onChange, uploadBtn }) {
  const projName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const compName = companies ? Object.fromEntries(companies.map((c) => [c.id, c.name])) : {};
  const q = h('input', { class: 'input search', type: 'search', placeholder: 'Search files', 'aria-label': 'Search files' });
  const cat = h('select', { class: 'input', style: 'width:auto', 'aria-label': 'Filter by category' }, h('option', { value: '' }, 'All categories'), Object.entries(CATEGORIES).map(([k, v]) => h('option', { value: k }, v)));
  const proj = projects.length ? h('select', { class: 'input', style: 'width:auto', 'aria-label': 'Filter by project' }, h('option', { value: '' }, 'All projects'), projects.map((p) => h('option', { value: p.id }, p.name))) : null;
  const holder = h('div');
  const render = () => {
    const term = q.value.toLowerCase();
    const rows = docs.filter((d) => (!term || (d.name + ' ' + (d.description || '') + ' ' + (compName[d.company_id] || '')).toLowerCase().includes(term))
      && (!cat.value || d.category === cat.value) && (!proj?.value || d.project_id === proj.value));
    holder.innerHTML = '';
    if (!docs.length) { holder.append(emptyState('No documents yet', staff ? 'Upload drawings, CAD, reports or certificates. Toggle "Shared" to make a file visible to the customer.' : 'Files your Stratabench team shares with you will appear here. You can also upload requirement files and CAD.', uploadBtn?.())); return; }
    if (!rows.length) { holder.append(emptyState('No matching files', 'Try a different search or filter.')); return; }
    const tbody = h('tbody');
    for (const d of rows) {
      const kind = fileKind(d.name);
      const viewable = kind !== 'other';
      const share = staff ? h('label', { class: 'switch xs', title: d.company_id ? 'Visible to customer' : 'Internal library files are staff-only' },
        h('input', { type: 'checkbox', checked: d.shared_with_customer, disabled: !d.company_id, onchange: async (e) => {
          const { error } = await sb.from('documents').update({ shared_with_customer: e.target.checked }).eq('id', d.id);
          if (error) { toast(error.message, true); e.target.checked = !e.target.checked; return; }
          d.shared_with_customer = e.target.checked; toast(e.target.checked ? 'Shared with customer.' : 'Hidden from customer.');
        } }), d.company_id ? (d.shared_with_customer ? 'Shared' : 'Internal') : 'Staff only') : null;
      const actions = h('td', { class: 'actions' },
        viewable ? h('button', { class: 'btn ghost sm', onclick: () => openDoc(d) }, icon(kind === '3d' ? 'cube' : 'eye'), kind === '3d' ? '3D view' : 'View') : null, ' ',
        h('button', { class: 'btn quiet sm', 'aria-label': `Download ${d.name}`, title: 'Download', onclick: () => downloadDoc(d) }, icon('download')),
        staff ? h('button', { class: 'btn quiet sm', 'aria-label': `Delete ${d.name}`, title: 'Delete', onclick: async () => {
          if (!(await confirmDialog('Delete file?', `"${d.name}" will be permanently removed for everyone, including the customer.`))) return;
          await sb.storage.from(BUCKET).remove([d.storage_path]);
          const { error } = await sb.from('documents').delete().eq('id', d.id);
          if (error) return toast(error.message, true);
          toast('File deleted.'); onChange?.();
        } }, icon('trash')) : null);
      tbody.append(h('tr', {},
        h('td', { style: 'width:3.2rem' }, fileBadge(d.name)),
        h('td', {}, h('div', { class: 'name', title: d.name }, d.name, ...[[d.deal_id, 'Opportunity'], [d.inquiry_id, 'Inquiry'], [d.activity_id, 'Note / task']].filter(([x]) => x).map(([, l]) => h('span', { class: 'badge', style: 'margin-left:.4rem;font-size:.65rem;vertical-align:middle' }, l))), d.description ? h('div', { class: 'muted xs ellipsis', style: 'max-width:28rem' }, d.description) : null),
        companies ? h('td', { class: 'small' }, compName[d.company_id] || h('span', { class: 'muted' }, 'Internal')) : null,
        h('td', { class: 'small' }, CATEGORIES[d.category] || d.category),
        projects.length ? h('td', { class: 'small muted' }, projName[d.project_id] || '—') : null,
        h('td', { class: 'small mono tnum', style: 'white-space:nowrap' }, fmtBytes(d.size_bytes)),
        h('td', { class: 'small muted', style: 'white-space:nowrap' }, fmtDate(d.created_at)),
        staff ? h('td', {}, share) : null,
        actions));
    }
    holder.append(h('div', { class: 'table-wrap' }, h('table', { class: 't' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Type'), h('th', {}, 'Name'), companies ? h('th', {}, 'Company') : null, h('th', {}, 'Category'), projects.length ? h('th', {}, 'Project') : null, h('th', {}, 'Size'), h('th', {}, 'Added'), staff ? h('th', {}, 'Visibility') : null, h('th', { class: 'actions' }, ''))),
      tbody)));
  };
  [q, cat, proj].forEach((el) => el?.addEventListener('input', render));
  render();
  return h('div', {}, h('div', { class: 'toolbar' }, q, cat, proj, h('div', { class: 'grow' }), uploadBtn?.()), holder);
}

/** Upload dialog. companyId null = internal staff library */
export function uploadDialog({ companyId, companies = null, projects = [], staff = false, defaultProject = '', onDone }) {
  const cats = staff ? Object.keys(CATEGORIES) : CUSTOMER_UPLOAD_CATS;
  const compSel = companies ? h('select', { class: 'input' }, h('option', { value: '' }, 'Internal library (staff only)'), companies.map((c) => h('option', { value: c.id, selected: c.id === companyId }, c.name))) : null;
  const catSel = h('select', { class: 'input' }, cats.map((k) => h('option', { value: k, selected: k === (staff ? 'drawing' : 'requirement') }, CATEGORIES[k])));
  const projSel = h('select', { class: 'input' }, h('option', { value: '' }, 'No specific project'));
  const fillProjects = () => {
    const cid = compSel ? compSel.value : companyId;
    projSel.innerHTML = ''; projSel.append(h('option', { value: '' }, 'No specific project'));
    projects.filter((p) => !cid || p.company_id === cid).forEach((p) => projSel.append(h('option', { value: p.id, selected: p.id === defaultProject }, p.name)));
  };
  fillProjects(); compSel?.addEventListener('change', fillProjects);
  const desc = h('input', { class: 'input', placeholder: 'Optional note, e.g. "Rev C, supersedes Rev B"' });
  const shareCb = h('input', { type: 'checkbox', checked: true });
  const shareRow = staff ? h('label', { class: 'switch full' }, shareCb, 'Share with the customer (visible in their portal)') : null;
  let uploaded = 0; let busy = false; const done = [];
  const zone = dropZone({ onFiles: async (files, list) => {
    if (busy) return toast('Uploads already in progress. Add more when they finish.', true);
    busy = true;
    for (const file of files) {
      const cid = compSel ? (compSel.value || null) : companyId;
      const pr = progressRow(file); list.append(pr.row);
      try {
        const path = newPath(cid || 'internal', file.name);
        await uploadFile(file, path, pr.set);
        const { data: row, error } = await sb.from('documents').insert({
          company_id: cid, project_id: projSel.value || null, name: file.name, category: catSel.value,
          storage_path: path, size_bytes: file.size, mime: file.type || null, description: desc.value.trim() || null,
          shared_with_customer: staff ? (!!cid && shareCb.checked) : true,
        }).select('*').single();
        if (error) throw error;
        if (row.company_id && row.shared_with_customer) done.push(row);
        pr.done(); uploaded++;
      } catch (e) { console.error(e); pr.fail(e.message || String(e)); toast(`${file.name}: ${e.message || 'upload failed'}`, true); }
    }
    busy = false;
  } });
  const body = h('div', { class: 'grid', style: 'gap:1rem' },
    h('div', { class: 'form-grid' },
      compSel ? h('label', { class: 'f full' }, 'Company', compSel) : null,
      h('label', { class: 'f' }, 'Category', catSel),
      h('label', { class: 'f' }, 'Project', projSel),
      h('label', { class: 'f full' }, 'Note', desc), shareRow),
    zone,
    h('p', { class: 'muted xs', style: 'margin:0' }, '3D preview supports STEP, IGES, STL, OBJ, glTF/GLB, 3MF and PLY. Native SolidWorks, Inventor, CATIA or Creo files are stored and downloadable; add a STEP export if you want to view them in the browser.'));
  modal({ title: 'Upload files', body, wide: true, actions: [{ label: 'Done', onClick: () => { if (busy) { toast('Wait for uploads to finish.', true); return false; } } }], onClose: async () => {
    if (!uploaded) return;
    // log shared files in the customer thread so the portal stays the single record
    const byCo = {}; done.forEach((r) => { (byCo[r.company_id] ||= []).push(r); });
    for (const [cid, rows] of Object.entries(byCo)) { try { await postFileNote({ companyId: cid, projectId: rows[0].project_id, docs: rows, staff }); } catch (e) { console.warn(e); } }
    onDone?.();
  } });
}
