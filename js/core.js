import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_KEY, STORAGE_URL, BUCKET } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'stratabench-auth' },
});

/* ---------- theme ---------- */
const root = document.documentElement;
root.dataset.theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
export function toggleTheme() { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; }

/* ---------- dom helpers ---------- */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icons = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  pipeline: '<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="7" rx="1"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  cube: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>',
};
export const icon = (name) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true'); s.innerHTML = icons[name] || ''; return s;
};

/* ---------- formatting ---------- */
export function fmtBytes(n) {
  if (n == null) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}
export const fmtDate = (d) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
export const fmtMoney = (v) => v == null || v === '' ? '—' : Number(v).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`; if (s < 604800) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(d);
}

export const CATEGORIES = {
  quote: 'Quote', po: 'Purchase order', drawing: 'Drawing', cad: 'CAD model', report: 'Report',
  cal_cert: 'Calibration certificate', test_data: 'Test data', manual: 'Manual / O&M', requirement: 'Requirement (CMM/ATP)', other: 'Other',
};
export const CUSTOMER_UPLOAD_CATS = ['requirement', 'cad', 'drawing', 'test_data', 'other'];
export const PROJECT_STATUS = { study: 'Study', design: 'Design', build: 'Build', test: 'Test / FAT', delivered: 'Delivered', on_hold: 'On hold' };
export const STAGES = { lead: 'Lead', qualified: 'Qualified', study: 'Study quoted', quoted: 'Build quoted', po: 'PO received', delivered: 'Delivered', lost: 'Lost' };

/* ---------- file kinds ---------- */
const CAD3D = ['step', 'stp', 'iges', 'igs', 'brep', 'stl', 'obj', 'gltf', 'glb', '3mf', 'ply'];
const IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
export const ext = (name) => (String(name).split('.').pop() || '').toLowerCase();
export function fileKind(name) {
  const e = ext(name);
  if (CAD3D.includes(e)) return '3d';
  if (e === 'pdf') return 'pdf';
  if (IMG.includes(e)) return 'image';
  if (['txt', 'csv', 'log', 'json', 'xml'].includes(e)) return 'text';
  return 'other';
}
export const NATIVE_CAD = ['sldprt', 'sldasm', 'slddrw', 'ipt', 'iam', 'catpart', 'catproduct', 'prt', 'asm', 'f3d', 'dwg', 'dxf', 'x_t', 'x_b', 'jt'];
export const fileBadge = (name) => {
  const e = ext(name).toUpperCase().slice(0, 6);
  return h('span', { class: 'filetype' }, e || 'FILE');
};

/* ---------- ui feedback ---------- */
let toastWrap;
export function toast(msg, isErr = false) {
  toastWrap ||= document.body.appendChild(h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' }));
  const t = h('div', { class: 'toast' + (isErr ? ' err' : '') }, msg);
  toastWrap.append(t); setTimeout(() => t.remove(), isErr ? 7000 : 3800);
}
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const foot = actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => {
    const b = h('button', { class: 'btn ' + (a.kind || ''), type: a.submit ? 'submit' : 'button' }, a.label);
    b.addEventListener('click', async (e) => {
      if (a.submit) return;
      e.preventDefault();
      if (a.onClick) { b.disabled = true; try { const r = await a.onClick(); if (r !== false) close(); } catch (err) { toast(err.message || String(err), true); } finally { b.disabled = false; } } else close();
    });
    return b;
  })) : null;
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x'))),
    h('div', { class: 'modal-body' }, body), foot);
  const ov = h('div', { class: 'overlay', onclick: (e) => { if (e.target === ov) close(); } }, box);
  document.body.append(ov); document.addEventListener('keydown', onKey);
  setTimeout(() => box.querySelector('input,select,textarea,button.btn')?.focus(), 30);
  return { close, el: box };
}
export function confirmDialog(title, text, label = 'Delete') {
  return new Promise((res) => {
    const m = modal({ title, body: h('p', {}, text), onClose: () => res(false), actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label, kind: 'danger', onClick: () => { res(true); } },
    ] });
  });
}
/** Build a form from field specs; returns {form, values()} */
export function formFields(specs, values = {}) {
  const grid = h('div', { class: 'form-grid' });
  for (const s of specs) {
    let input;
    const v = values[s.name] ?? s.value ?? '';
    if (s.type === 'select') {
      input = h('select', { class: 'input', name: s.name }, Object.entries(s.options).map(([k, l]) => h('option', { value: k, selected: String(v) === String(k) }, l)));
    } else if (s.type === 'textarea') {
      input = h('textarea', { class: 'input', name: s.name, rows: s.rows || 4, placeholder: s.placeholder || '' }); input.value = v;
    } else if (s.type === 'checkbox') {
      input = h('input', { type: 'checkbox', name: s.name, checked: !!v });
      grid.append(h('label', { class: 'switch ' + (s.full ? 'full' : '') }, input, s.label));
      continue;
    } else {
      input = h('input', { class: 'input', name: s.name, type: s.type || 'text', placeholder: s.placeholder || '', required: s.required, step: s.step });
      input.value = v ?? '';
    }
    grid.append(h('label', { class: 'f ' + (s.full ? 'full' : '') }, s.label, input));
  }
  const read = () => {
    const out = {};
    for (const s of specs) {
      const el = grid.querySelector(`[name="${s.name}"]`);
      if (s.type === 'checkbox') out[s.name] = el.checked;
      else { const val = el.value.trim(); out[s.name] = val === '' ? null : (s.type === 'number' ? Number(val) : val); }
    }
    return out;
  };
  return { el: grid, read };
}

/* ---------- auth ---------- */
export async function currentProfile() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !data) return null;
  return data;
}
export async function requireRole(roles) {
  const p = await currentProfile();
  if (!p || p.disabled) { location.replace('login.html' + (p?.disabled ? '?disabled=1' : '')); throw new Error('redirect'); }
  if (!roles.includes(p.role)) { location.replace(p.role === 'customer' ? 'portal.html' : 'crm.html'); throw new Error('redirect'); }
  return p;
}
export async function signOut() { await sb.auth.signOut(); location.replace('login.html'); }

export function passwordDialog(profile, forced = false) {
  const p1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: 10 });
  const p2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const err = h('p', { class: 'err-text' });
  const body = h('div', { class: 'grid' },
    forced ? h('p', { class: 'muted small' }, 'You signed in with a temporary password. Choose your own password to continue.') : null,
    h('label', { class: 'f' }, 'New password (10+ characters)', p1),
    h('label', { class: 'f' }, 'Confirm new password', p2), err);
  let saved = false;
  return new Promise((res) => {
    const m = modal({ title: forced ? 'Set your password' : 'Change password', body, onClose: () => { if (forced && !saved) signOut(); res(saved); }, actions: [
      ...(forced ? [] : [{ label: 'Cancel', kind: 'ghost' }]),
      { label: 'Save password', onClick: async () => {
        if (p1.value.length < 10) { err.textContent = 'Use at least 10 characters.'; return false; }
        if (p1.value !== p2.value) { err.textContent = "Passwords don't match."; return false; }
        const { error } = await sb.auth.updateUser({ password: p1.value });
        if (error) { err.textContent = error.message; return false; }
        await sb.from('profiles').update({ must_change_password: false }).eq('id', profile.id);
        profile.must_change_password = false;
        saved = true; toast('Password updated.');
        return true;
      } },
    ] });
    if (forced) { const ov = m.el.parentElement; ov.onclick = null; m.el.querySelector('.modal-head .icon-btn').remove(); }
  });
}

/* ---------- storage ---------- */
const SMALL = 6 * 1024 * 1024;
let tusMod;
export function safeName(name) { return name.replace(/[^\w.\-() ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'file'; }
export function newPath(prefix, name) { return `${prefix}/${crypto.randomUUID()}/${safeName(name)}`; }

/** Upload with resumable (TUS) protocol for anything over 6 MB. onProgress(0..1) */
export async function uploadFile(file, path, onProgress = () => {}) {
  if (file.size <= SMALL) {
    onProgress(0.05);
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) throw error; onProgress(1); return;
  }
  tusMod ||= window.tus || await new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/tus-js-client@4.1.0/dist/tus.min.js';
    sc.onload = () => res(window.tus); sc.onerror = () => rej(new Error('Upload library failed to load'));
    document.head.append(sc);
  });
  const { data: { session } } = await sb.auth.getSession();
  await new Promise((resolve, reject) => {
    const up = new tusMod.Upload(file, {
      endpoint: `${STORAGE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: path, contentType: file.type || 'application/octet-stream', cacheControl: '3600' },
      chunkSize: 6 * 1024 * 1024,
      onError: reject,
      onProgress: (sent, total) => onProgress(sent / total),
      onSuccess: resolve,
    });
    up.findPreviousUploads().then((prev) => { if (prev.length) up.resumeFromPreviousUpload(prev[0]); up.start(); });
  });
  onProgress(1);
}
export async function signedUrl(path, downloadName) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 2, downloadName ? { download: downloadName } : undefined);
  if (error) throw error; return data.signedUrl;
}
export async function downloadDoc(doc) {
  try { const url = await signedUrl(doc.storage_path, doc.name); const a = h('a', { href: url, download: doc.name }); document.body.append(a); a.click(); a.remove(); }
  catch (e) { toast('Download failed: ' + e.message, true); }
}

/** Upload panel: drop zone + list with progress. onFile(file) => Promise; called sequentially */
export function dropZone({ multiple = true, onFiles, hint = '' }) {
  const input = h('input', { type: 'file', multiple, class: 'hidden' });
  const list = h('div', { class: 'up-list' });
  const zone = h('div', { class: 'drop', tabindex: 0, role: 'button' },
    h('div', {}, h('b', {}, 'Drop files here'), ' or click to choose'),
    h('div', { class: 'xs', style: 'margin-top:.35rem' }, hint || 'Large CAD and PDF files are fine. Uploads over 6 MB resume automatically if the connection drops.'));
  const pick = () => input.click();
  zone.addEventListener('click', pick);
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); onFiles([...e.dataTransfer.files], list); });
  input.addEventListener('change', () => { onFiles([...input.files], list); input.value = ''; });
  return h('div', {}, zone, input, list);
}
export function progressRow(file) {
  const bar = h('i'); const pct = h('span', { class: 'mono xs muted' }, '0%');
  const row = h('div', { class: 'up' }, h('span', { class: 'ellipsis' }, file.name, h('span', { class: 'muted xs' }, '  ' + fmtBytes(file.size))), pct, h('div', { class: 'bar' }, bar));
  return { row, set: (p) => { bar.style.width = `${Math.round(p * 100)}%`; pct.textContent = `${Math.round(p * 100)}%`; }, done: () => { row.classList.add('done'); pct.textContent = 'Uploaded'; }, fail: (m) => { row.classList.add('fail'); pct.textContent = 'Failed'; row.title = m; } };
}

/* ---------- viewer ---------- */
export async function openDoc(doc) {
  const kind = fileKind(doc.name);
  if (kind === 'other') {
    const native = NATIVE_CAD.includes(ext(doc.name));
    modal({ title: doc.name, body: h('div', { class: 'grid' },
      h('p', {}, native ? 'This is a native CAD format that browsers cannot display. Download it to open in your CAD software. To view it here, export a STEP (.step/.stp), STL, or glTF/GLB copy and upload that alongside it.' : "This file type can't be previewed in the browser. Download it to open it."),
      h('p', { class: 'muted small' }, fmtBytes(doc.size_bytes))),
    actions: [{ label: 'Close', kind: 'ghost' }, { label: 'Download', onClick: () => downloadDoc(doc) }] });
    return;
  }
  const { openViewer } = await import('./viewer.js');
  openViewer(doc, kind);
}

/* ---------- app shell ---------- */
export function shell({ profile, items, subtitle }) {
  const app = document.getElementById('app'); app.innerHTML = '';
  const nav = h('nav', { 'aria-label': 'Sections', class: 'grid', style: 'gap:2px' });
  const navEls = {};
  for (const it of items) {
    const a = h('a', { class: 'nav-item', href: `#/${it.id}` }, icon(it.icon), it.label);
    if (it.count != null) a.append(h('span', { class: 'count hidden', 'data-count': it.id }));
    navEls[it.id] = a; nav.append(a);
  }
  const side = h('aside', { class: 'side' },
    h('a', { class: 'brand', href: 'index.html' }, h('img', { src: 'img/mark.png', alt: '' }), h('span', {}, h('strong', {}, 'Stratabench'), h('em', {}, subtitle))),
    nav, h('div', { class: 'spacer' }),
    h('div', { class: 'me' }, h('b', {}, profile.full_name || profile.email), h('span', { class: 'muted xs' }, profile.email),
      h('div', { class: 'row', style: 'margin-top:.6rem;gap:.35rem' },
        h('button', { class: 'icon-btn', 'aria-label': 'Toggle color theme', title: 'Theme', onclick: toggleTheme }, icon('sun')),
        h('button', { class: 'icon-btn', 'aria-label': 'Change password', title: 'Change password', onclick: () => passwordDialog(profile) }, icon('key')),
        h('button', { class: 'icon-btn', 'aria-label': 'Sign out', title: 'Sign out', onclick: signOut }, icon('out')))));
  const titleEl = h('h1', {});
  const actionsEl = h('div', { class: 'row', style: 'gap:.5rem' });
  const crumbEl = h('div', { class: 'row', style: 'gap:.5rem;min-width:0' });
  const menuBtn = h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Open menu', onclick: () => side.classList.toggle('open') }, icon('menu'));
  const content = h('div', { class: 'content', id: 'content' });
  app.append(h('div', { class: 'shell' }, side, h('div', { class: 'main' }, h('header', { class: 'topbar' }, menuBtn, crumbEl, h('div', { class: 'grow' }), actionsEl), content)));
  side.addEventListener('click', (e) => { if (e.target.closest('a.nav-item')) side.classList.remove('open'); });
  return {
    content,
    set(title, { active, actions = [], back } = {}) {
      crumbEl.innerHTML = '';
      if (back) crumbEl.append(h('a', { class: 'crumb', href: back.href }, back.label), h('span', { class: 'muted' }, '/'));
      titleEl.textContent = title; crumbEl.append(titleEl); document.title = `${title} — Stratabench`;
      actionsEl.innerHTML = ''; actionsEl.append(...actions);
      Object.entries(navEls).forEach(([id, a]) => { if (id === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      content.innerHTML = ''; window.scrollTo(0, 0);
    },
    count(id, n) { const c = side.querySelector(`[data-count="${id}"]`); if (c) { c.textContent = n; c.classList.toggle('hidden', !n); } },
  };
}
export const btn = (label, onclick, kind = '', ic) => h('button', { class: `btn ${kind}`, onclick }, ic ? icon(ic) : null, label);
export const loading = () => h('div', { class: 'grid', style: 'gap:.6rem' }, h('div', { class: 'skeleton', style: 'width:30%' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton', style: 'width:80%' }));
export const emptyState = (title, text, action) => h('div', { class: 'empty' }, h('b', {}, title), h('span', { class: 'small' }, text), action ? h('div', { style: 'margin-top:1rem' }, action) : null);
export function table(cols, rows, { onRow, empty } = {}) {
  if (!rows.length) return empty || emptyState('Nothing here yet', '');
  return h('div', { class: 'table-wrap' }, h('table', { class: 't' },
    h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.cls || '' }, c.label)))),
    h('tbody', {}, rows.map((r) => {
      const tr = h('tr', { class: onRow ? 'click' : '' }, cols.map((c) => { const v = c.render ? c.render(r) : r[c.key]; return h('td', { class: c.cls || '' }, v ?? '—'); }));
      if (onRow) tr.addEventListener('click', (e) => { if (!e.target.closest('button,a,input,select,label')) onRow(r); });
      return tr;
    }))));
}
export function statusBadge(map, val, tone = {}) { return h('span', { class: 'badge ' + (tone[val] || '') }, map[val] || val); }
