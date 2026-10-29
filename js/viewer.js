import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { h, icon, ext, fmtBytes, signedUrl, downloadDoc, toast } from './core.js';

const OCCT = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';
const STEEL = 0x9fb3c8;

/* fetch with streamed progress */
async function fetchBuffer(url, onProgress) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  const total = Number(r.headers.get('content-length')) || 0;
  if (!r.body || !total) { const b = await r.arrayBuffer(); onProgress(1, b.byteLength, b.byteLength); return b; }
  const reader = r.body.getReader(); const out = new Uint8Array(total); let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; out.set(value, got); got += value.length; onProgress(got / total, got, total); }
  return out.buffer;
}

/* STEP / IGES / BREP conversion in a worker so the page stays responsive */
function occtWorker(buffer, format) {
  const src = `
    importScripts('${OCCT}occt-import-js.js');
    self.onmessage = async (e) => {
      try {
        const occt = await occtimportjs({ locateFile: (p) => '${OCCT}' + p });
        const fn = { step: 'ReadStepFile', iges: 'ReadIgesFile', brep: 'ReadBrepFile' }[e.data.format];
        const res = occt[fn](new Uint8Array(e.data.buffer), { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 });
        if (!res.success) throw new Error('The file could not be converted. It may be damaged or use unsupported entities.');
        const meshes = res.meshes.map((m) => ({ name: m.name, color: m.color, pos: new Float32Array(m.attributes.position.array), nor: m.attributes.normal ? new Float32Array(m.attributes.normal.array) : null, idx: m.index ? new Uint32Array(m.index.array) : null }));
        self.postMessage({ ok: true, meshes }, meshes.flatMap((m) => [m.pos.buffer, m.nor?.buffer, m.idx?.buffer].filter(Boolean)));
      } catch (err) { self.postMessage({ ok: false, error: String(err.message || err) }); }
    };`;
  const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  return new Promise((res, rej) => {
    w.onmessage = (e) => { w.terminate(); e.data.ok ? res(e.data.meshes) : rej(new Error(e.data.error)); };
    w.onerror = (e) => { w.terminate(); rej(new Error(e.message || 'Converter failed to load')); };
    w.postMessage({ buffer, format }, [buffer]);
  });
}

function material(color) {
  return new THREE.MeshStandardMaterial({ color: color ?? STEEL, metalness: 0.35, roughness: 0.48, side: THREE.DoubleSide, clippingPlanes: [] });
}

async function parse(buffer, e, status) {
  const group = new THREE.Group();
  if (['step', 'stp', 'iges', 'igs', 'brep'].includes(e)) {
    status('Converting CAD geometry…', 'Large STEP assemblies can take a minute. The page stays usable while this runs.');
    const fmt = e === 'stp' || e === 'step' ? 'step' : e === 'brep' ? 'brep' : 'iges';
    const meshes = await occtWorker(buffer, fmt);
    meshes.forEach((m, i) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
      if (m.nor) g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
      if (m.idx) g.setIndex(new THREE.BufferAttribute(m.idx, 1));
      if (!m.nor) g.computeVertexNormals();
      const col = m.color ? new THREE.Color(m.color[0], m.color[1], m.color[2]) : null;
      const mesh = new THREE.Mesh(g, material(col)); mesh.name = m.name || `Part ${i + 1}`; group.add(mesh);
    });
    group.userData.units = 'mm';
  } else if (e === 'stl') {
    const g = new STLLoader().parse(buffer); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material(g.hasColors ? 0xffffff : null));
    if (g.hasColors) mesh.material.vertexColors = true;
    group.add(mesh);
  } else if (e === 'ply') {
    const g = new PLYLoader().parse(buffer); g.computeVertexNormals();
    const m = material(); if (g.attributes.color) { m.vertexColors = true; m.color.set(0xffffff); }
    group.add(new THREE.Mesh(g, m));
  } else if (e === 'obj') {
    const obj = new OBJLoader().parse(new TextDecoder().decode(buffer));
    obj.traverse((o) => { if (o.isMesh) o.material = material(); });
    group.add(obj);
  } else if (e === 'glb' || e === 'gltf') {
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buffer, '', res, rej));
    gltf.scene.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.side = THREE.DoubleSide; m.clippingPlanes = []; }); } });
    group.add(gltf.scene);
  } else if (e === '3mf') {
    const obj = new ThreeMFLoader().parse(buffer);
    obj.traverse((o) => { if (o.isMesh) { o.material = material(o.material?.color); } });
    group.add(obj);
  } else throw new Error('Unsupported 3D format');
  return group;
}

export async function openViewer(doc, kind) {
  const titleEl = h('div', { class: 'title' }, doc.name, h('span', { class: 'muted xs mono' }, '  ' + fmtBytes(doc.size_bytes)));
  const body = h('div', { class: 'viewer-body' });
  const tools = h('div', { class: 'row', style: 'gap:.4rem;flex-wrap:wrap' });
  const closeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Close viewer' }, icon('x'));
  const dlBtn = h('button', { class: 'btn ghost sm' }, icon('download'), 'Download');
  dlBtn.onclick = () => downloadDoc(doc);
  const shell = h('div', { class: 'viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Viewer: ${doc.name}` },
    h('div', { class: 'viewer-head' }, titleEl, tools, dlBtn, closeBtn), body);
  document.body.append(shell); document.body.style.overflow = 'hidden';
  let cleanup = () => {};
  const close = () => { cleanup(); shell.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  closeBtn.onclick = close; document.addEventListener('keydown', onKey);

  const statusLayer = h('div', { class: 'viewer-status' });
  const status = (title, sub = '', pct = null) => {
    statusLayer.innerHTML = '';
    statusLayer.append(h('div', { class: 'box' }, h('b', {}, title), sub ? h('p', { class: 'muted small', style: 'margin:.35rem 0 0' }, sub) : null,
      pct != null ? h('div', { class: 'bar', style: 'margin-top:.75rem' }, h('i', { style: `width:${Math.round(pct * 100)}%` })) : null));
    if (!statusLayer.isConnected) body.append(statusLayer);
  };
  const clearStatus = () => statusLayer.remove();

  try {
    if (kind === 'pdf') {
      status('Opening PDF…', fmtBytes(doc.size_bytes));
      const url = await signedUrl(doc.storage_path);
      const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
      // range requests: large PDFs stream page by page instead of downloading whole
      const pdf = await pdfjs.getDocument({ url, rangeChunkSize: 1 << 20, disableAutoFetch: true, disableStream: false }).promise;
      clearStatus();
      const pane = h('div', { class: 'pdfv', tabindex: 0 }); body.append(pane); pane.focus();
      let zoom = 1; const pages = [];
      const pageInfo = h('span', { class: 'mono xs muted' }, `${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}`);
      const first = await pdf.getPage(1); const base = first.getViewport({ scale: 1 });
      const fitScale = () => Math.min(1.6, (pane.clientWidth - 32) / base.width);
      const render = async (slot) => {
        if (slot.dataset.done === String(zoom)) return; slot.dataset.done = String(zoom);
        const page = await pdf.getPage(Number(slot.dataset.n));
        const vp = page.getViewport({ scale: fitScale() * zoom * Math.min(devicePixelRatio, 2) });
        const cv = h('canvas', { width: Math.floor(vp.width), height: Math.floor(vp.height), 'aria-label': `Page ${slot.dataset.n}` });
        cv.style.width = Math.floor(vp.width / Math.min(devicePixelRatio, 2)) + 'px';
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        slot.replaceChildren(cv);
      };
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) render(e.target); }), { root: pane, rootMargin: '800px 0px' });
      const layout = () => {
        const w = base.width * fitScale() * zoom, hh = base.height * fitScale() * zoom;
        pages.forEach((slot) => { slot.style.width = w + 'px'; slot.style.minHeight = hh + 'px'; delete slot.dataset.done; io.unobserve(slot); io.observe(slot); });
      };
      for (let n = 1; n <= pdf.numPages; n++) { const slot = h('div', { class: 'ph-slot', style: 'margin:0 auto 1rem;max-width:calc(100% - 1rem)', dataset: { n } }); pages.push(slot); pane.append(slot); }
      layout();
      const zb = (label, f) => { const b = h('button', { class: 'btn ghost sm' }, label); b.onclick = () => { zoom = f(zoom); layout(); }; return b; };
      tools.append(pageInfo, zb('−', (z) => Math.max(0.5, z / 1.25)), zb('Fit', () => 1), zb('+', (z) => Math.min(4, z * 1.25)));
      cleanup = () => { io.disconnect(); pdf.destroy(); };
      return;
    }
    if (kind === 'image') {
      const url = await signedUrl(doc.storage_path);
      body.append(h('img', { class: 'preview', src: url, alt: doc.name }));
      return;
    }
    if (kind === 'text') {
      const url = await signedUrl(doc.storage_path);
      const r = await fetch(url, { headers: { Range: 'bytes=0-2000000' } });
      const txt = await r.text();
      body.append(h('pre', { class: 'mono xs', style: 'margin:0;padding:1rem 1.25rem;overflow:auto;height:100%;white-space:pre' }, txt + (doc.size_bytes > 2000000 ? '\n\n… preview shows the first 2 MB. Download for the full file.' : '')));
      return;
    }

    /* ---- 3D ---- */
    const e = ext(doc.name);
    if (doc.size_bytes > 700 * 1024 * 1024) {
      status('This model is very large', `At ${fmtBytes(doc.size_bytes)}, opening it in a browser may run out of memory. Download it for your CAD software, or upload a lighter STEP or GLB export for viewing.`);
      return;
    }
    status('Downloading model…', fmtBytes(doc.size_bytes), 0);
    const url = await signedUrl(doc.storage_path);
    const buf = await fetchBuffer(url, (p, got, total) => status('Downloading model…', `${fmtBytes(got)} of ${fmtBytes(total)}`, p));
    const model = await parse(buf, e, (t, s) => status(t, s));

    // scene
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    body.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const isDark = () => document.documentElement.dataset.theme === 'dark';
    scene.background = new THREE.Color(isDark() ? 0x0b121c : 0xeef2f7);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1e7);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd9ff, 0.6); scene.add(fill);
    scene.add(model);

    // center model
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const radius = Math.max(size.length() / 2, 1e-6);
    const grid = new THREE.GridHelper(radius * 4, 20, isDark() ? 0x2b4560 : 0xb8c6d6, isDark() ? 0x182638 : 0xd6dee8);
    grid.position.y = -size.y / 2; scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;

    let dirty = true; const req = () => { dirty = true; };
    controls.addEventListener('change', req);
    const setView = (dir) => {
      const d = new THREE.Vector3(...dir).normalize();
      const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.1;
      camera.position.copy(d.multiplyScalar(dist)); camera.near = dist / 1000; camera.far = dist * 100; camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0); controls.update();
      key.position.set(dist, dist * 1.5, dist); fill.position.set(-dist, dist * 0.3, -dist * 0.8); req();
    };
    const resize = () => { const w = body.clientWidth, hh = body.clientHeight; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); req(); };
    const ro = new ResizeObserver(resize); ro.observe(body);
    setView([1, 0.8, 1.2]); resize();

    let raf; const loop = () => { raf = requestAnimationFrame(loop); if (controls.update() || dirty) { renderer.render(scene, camera); dirty = false; } };
    loop(); clearStatus();

    // stats HUD
    let tris = 0; const meshes = [];
    model.traverse((o) => { if (o.isMesh) { meshes.push(o); const g = o.geometry; tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3; } });
    const u = model.userData.units || 'file units';
    const fmtN = (n) => n >= 1000 ? n.toPrecision(4) : n.toPrecision(3);
    body.append(h('div', { class: 'viewer-hud' },
      h('span', {}, `Extents  ${fmtN(size.x)} × ${fmtN(size.y)} × ${fmtN(size.z)} ${u}`),
      h('span', {}, `${meshes.length} ${meshes.length === 1 ? 'body' : 'bodies'} · ${Math.round(tris).toLocaleString()} triangles`),
      h('span', {}, 'Drag to orbit · right-drag to pan · scroll to zoom')));

    // tools
    const tbtn = (label, fn, pressed) => { const b = h('button', { class: 'btn ghost sm', 'aria-pressed': pressed == null ? null : String(pressed) }, label); b.onclick = () => fn(b); return b; };
    const views = h('div', { class: 'seg', role: 'group', 'aria-label': 'Views' },
      ...[['Iso', [1, 0.8, 1.2]], ['Front', [0, 0, 1]], ['Top', [0, 1, 0.0001]], ['Right', [1, 0, 0]]].map(([l, d]) => { const b = h('button', {}, l); b.onclick = () => setView(d); return b; }));
    let wire = false;
    const wireBtn = tbtn('Wireframe', (b) => { wire = !wire; meshes.forEach((m) => { (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => { mm.wireframe = wire; }); }); b.setAttribute('aria-pressed', wire); req(); }, false);
    let edges = null;
    const edgeBtn = tbtn('Edges', (b) => {
      if (edges) { scene.remove(edges); edges.traverse((o) => o.geometry?.dispose()); edges = null; b.setAttribute('aria-pressed', 'false'); req(); return; }
      if (tris > 3e6) { toast('Too many triangles to draw edges smoothly on this model.', true); return; }
      edges = new THREE.Group(); const lm = new THREE.LineBasicMaterial({ color: isDark() ? 0x0a1420 : 0x1d2b3a, transparent: true, opacity: 0.55, clippingPlanes: [] });
      meshes.forEach((m) => { const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), lm); m.updateWorldMatrix(true, false); l.applyMatrix4(m.matrixWorld); edges.add(l); });
      scene.add(edges); b.setAttribute('aria-pressed', 'true'); if (sectionOn) applyPlane(); req();
    }, false);
    const gridBtn = tbtn('Grid', (b) => { grid.visible = !grid.visible; b.setAttribute('aria-pressed', grid.visible); req(); }, true);

    // section plane
    const plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    const half = { x: size.x / 2, y: size.y / 2, z: size.z / 2 };
    let axis = 'x', flip = false, sectionOn = false;
    const slider = h('input', { type: 'range', min: -1, max: 1, step: 0.002, value: 0, 'aria-label': 'Section position' });
    const sectionReadout = h('span', { class: 'mono' });
    const applyPlane = () => {
      const n = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis];
      const s = flip ? 1 : -1; plane.normal.set(n[0] * s, n[1] * s, n[2] * s);
      const pos = Number(slider.value) * half[axis]; plane.constant = s === -1 ? pos : -pos; // keep side with n·p + c ≥ 0
      sectionReadout.textContent = `${axis.toUpperCase()} = ${fmtN(pos)} ${u}`;
      const planes = sectionOn ? [plane] : [];
      meshes.forEach((m) => (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => { mm.clippingPlanes = planes; mm.needsUpdate = true; }));
      if (edges) edges.children.forEach((l) => { l.material.clippingPlanes = planes; });
      req();
    };
    slider.oninput = applyPlane;
    const axisSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Section axis' }, ...['x', 'y', 'z'].map((a) => { const b = h('button', { 'aria-pressed': String(a === axis) }, a.toUpperCase()); b.onclick = () => { axis = a; axisSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); applyPlane(); }; return b; }));
    const flipBtn = h('button', { class: 'btn ghost sm' }, 'Flip'); flipBtn.onclick = () => { flip = !flip; applyPlane(); };
    const panel = h('div', { class: 'viewer-section hidden' }, h('div', { class: 'row' }, h('b', { class: 'grow' }, 'Section view'), axisSeg, flipBtn), slider, sectionReadout);
    body.append(panel);
    const secBtn = tbtn('Section', (b) => { sectionOn = !sectionOn; panel.classList.toggle('hidden', !sectionOn); b.setAttribute('aria-pressed', sectionOn); applyPlane(); }, false);

    // parts list for assemblies
    let partsBtn = null;
    if (meshes.length > 1 && meshes.length <= 2000) {
      const plist = h('div', { class: 'viewer-section hidden', style: 'left:1rem;right:auto;top:1rem;bottom:auto;max-height:60%;overflow:auto;width:17rem' },
        h('b', {}, `Parts (${meshes.length})`),
        ...meshes.map((m) => { const cb = h('input', { type: 'checkbox', checked: true }); cb.onchange = () => { m.visible = cb.checked; req(); }; return h('label', { class: 'switch xs' }, cb, h('span', { class: 'ellipsis' }, m.name || 'Part')); }));
      body.append(plist);
      partsBtn = tbtn('Parts', (b) => { const on = plist.classList.toggle('hidden'); b.setAttribute('aria-pressed', String(!on)); }, false);
    }
    const shotBtn = tbtn('Snapshot', () => { renderer.render(scene, camera); const a = h('a', { href: renderer.domElement.toDataURL('image/png'), download: doc.name.replace(/\.[^.]+$/, '') + '-view.png' }); a.click(); });
    tools.append(views, tbtn('Fit', () => setView([1, 0.8, 1.2])), wireBtn, edgeBtn, secBtn, gridBtn, partsBtn, shotBtn);

    cleanup = () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; ms.forEach((m) => m.dispose?.()); });
      renderer.dispose(); renderer.forceContextLoss?.();
    };
  } catch (err) {
    console.error(err);
    status("Couldn't open this file", err.message || String(err));
  }
}
