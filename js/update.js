// Automatic updates for the website and the installed Home Screen app.
// Each deploy stamps a build id into the page (meta[name=build]) and /version.json.
// When they differ, the page reloads itself at a safe moment, or offers a Reload button if you're mid-task.
const BUILD = document.querySelector('meta[name="build"]')?.content || '__BUILD__';
const DEV = BUILD.startsWith('__');
let pending = null, banner = null, checking = false;

const busy = () =>
  (window.sbBusy || 0) > 0 ||                                   // uploads in progress
  !!document.querySelector('.modal, .viewer') ||                 // dialog or 3D/PDF viewer open
  [...document.querySelectorAll('textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=search])')]
    .some((el) => el.value && el.value !== el.defaultValue && !el.closest('[data-no-update-guard]'));

async function latest() {
  try {
    const r = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()).build || null;
  } catch { return null; }
}

function reloadNow() {
  try { sessionStorage.setItem('sb-updated-to', pending || ''); } catch {}
  location.reload();
}

const CSS = `.update-bar{position:fixed;z-index:90;left:50%;transform:translateX(-50%);top:max(.75rem,calc(env(safe-area-inset-top) + .5rem));display:flex;align-items:center;gap:.75rem;background:#192840;color:#eaf1f8;border:1px solid #23364b;border-left:3px solid #4aa3e3;border-radius:12px;padding:.55rem .6rem .55rem .9rem;box-shadow:0 12px 32px rgba(0,0,0,.3);font:500 14px/1.3 Satoshi,system-ui,sans-serif;width:max-content;max-width:calc(100% - 1.5rem)}
.update-bar .btn{background:#4aa3e3;color:#06121f;border:0;border-radius:8px;padding:.4rem .8rem;font:700 13px/1 inherit;font-family:inherit;cursor:pointer}
.update-bar .later{background:none;border:0;color:#9aadc2;font:inherit;cursor:pointer;padding:.3rem .4rem}`;
function showBanner() {
  if (banner) return;
  if (!document.getElementById('sb-update-css')) { const st = document.createElement('style'); st.id = 'sb-update-css'; st.textContent = CSS; document.head.append(st); }
  banner = document.createElement('div');
  banner.className = 'update-bar'; banner.setAttribute('role', 'status');
  banner.innerHTML = '<span>A new version of Stratabench is ready.</span><button type="button" class="btn primary sm">Reload</button><button type="button" class="later" aria-label="Later">Later</button>';
  banner.querySelector('.btn').onclick = reloadNow;
  banner.querySelector('.later').onclick = () => { banner.remove(); banner = null; setTimeout(apply, 5 * 60e3); };
  document.body.append(banner);
}

function apply() {
  if (!pending) return;
  if (document.visibilityState === 'hidden' || !busy()) reloadNow();
  else showBanner();
}

export async function check() {
  if (DEV || checking) return;
  checking = true;
  const v = await latest();
  checking = false;
  if (v && v !== BUILD && !v.startsWith('__')) {
    // avoid reload loops if the CDN is briefly serving an older page after an update
    let last = null; try { last = sessionStorage.getItem('sb-updated-to'); } catch {}
    if (last === v) return;
    pending = v;
    navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
    apply();
  }
}

// Check on open, whenever the app comes back to the foreground, when back online, and every 10 minutes.
if (!DEV) {
  setTimeout(check, 3000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); else if (pending) reloadNow(); });
  addEventListener('online', check);
  addEventListener('pageshow', (e) => { if (e.persisted) check(); });
  setInterval(check, 10 * 60e3);
  // a new service worker took over: check whether the page itself is stale
  navigator.serviceWorker?.addEventListener('controllerchange', check);
}
window.sbCheckForUpdate = check;
