// One-time tip: how to add the portal to the Home Screen (iPhone/iPad Safari has no install prompt).
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
let deferred = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; show(false); });
function show(isIos) {
  if (standalone || localStorage.getItem('sb-install-tip') || document.querySelector('.install-tip')) return;
  if (document.querySelector('.modal, .viewer')) { setTimeout(() => show(isIos), 3000); return; }
  const el = document.createElement('div'); el.className = 'install-tip'; el.setAttribute('role', 'status');
  el.innerHTML = isIos
    ? '<img src="/img/icon-192.png" alt="" width="36" height="36"><div><b>Add Stratabench to your Home Screen</b><span>Tap the Share button <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-label="Share"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>, then <b>Add to Home Screen</b>.</span></div><button aria-label="Dismiss">✕</button>'
    : '<img src="/img/icon-192.png" alt="" width="36" height="36"><div><b>Install Stratabench</b><span>Open the portal from your home screen like an app.</span></div><button class="go">Install</button><button aria-label="Dismiss">✕</button>';
  const close = () => { localStorage.setItem('sb-install-tip', '1'); el.remove(); };
  el.querySelector('[aria-label="Dismiss"]').onclick = close;
  el.querySelector('.go')?.addEventListener('click', async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; } close(); });
  document.body.append(el);
}
if (ios && !standalone) setTimeout(() => show(true), 2500);
