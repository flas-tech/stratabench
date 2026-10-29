// Home Screen install + Web Push for the portal and CRM.
import { sb, h, icon, modal, toast } from './core.js';
import { SUPABASE_URL, VAPID_PUBLIC } from './config.js';

const ua = navigator.userAgent;
export const env = {
  ios: /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  android: /android/i.test(ua),
  standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  pushable: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
};
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; document.dispatchEvent(new Event('sb-installable')); });
export const canInstallPrompt = () => !!installEvt;
export async function promptInstall() { if (!installEvt) return false; installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null; return r.outcome === 'accepted'; }

const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
const reg = () => navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);

export async function currentSub() { if (!env.pushable) return null; const r = await reg(); return r.pushManager.getSubscription(); }

async function save(sub) {
  const j = sub.toJSON();
  const { error } = await sb.rpc('register_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: ua });
  if (error) throw error;
}

/** Ask permission (must run from a tap) and register this device. */
export async function enable() {
  if (!env.pushable) throw new Error(env.ios && !env.standalone ? 'On iPhone, add Stratabench to your Home Screen first, then turn on notifications from the app.' : 'This browser does not support notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked. Turn them on for Stratabench in your device settings.' : 'Notifications were not turned on.');
  const r = await reg();
  let sub = await r.pushManager.getSubscription();
  if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLIC) });
  await save(sub);
  localStorage.removeItem('sb-push-snooze');
  return sub;
}
export async function disable() {
  const sub = await currentSub(); if (!sub) return;
  await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe();
}
/** Called on sign-out so the next person on this device doesn't get your alerts. */
export async function forgetDevice() { const sub = await currentSub(); if (sub) await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); }
export async function sendTest() {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/push-notify`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action: 'test' }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Test failed'); return j;
}

/** Keep this device's registration current (new login on the device, rotated keys). */
export async function refresh() {
  if (!env.pushable || Notification.permission !== 'granted') return;
  try { const sub = await currentSub(); if (sub) await save(sub); else await enable(); } catch {}
}

const shareIco = () => h('span', { class: 'ico-inline', 'aria-label': 'Share' }, icon('iosshare'));
export function iosSteps() {
  return h('ol', { class: 'steps-mini' },
    h('li', {}, 'Open this page in ', h('b', {}, 'Safari'), '.'),
    h('li', {}, 'Tap the Share button ', shareIco(), ' (bottom of the screen on iPhone, top on iPad).'),
    h('li', {}, 'Scroll and tap ', h('b', {}, 'Add to Home Screen'), ', then ', h('b', {}, 'Add'), '.'),
    h('li', {}, 'Open Stratabench from your Home Screen, sign in, and tap ', h('b', {}, 'Turn on notifications'), '.'));
}

/** What the user still needs to do on this device. */
export async function nextStep() {
  if (env.ios && !env.standalone) return 'install';
  if (!env.pushable) return env.standalone ? null : (installEvt ? 'install' : null);
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default' || !(await currentSub())) return 'notify';
  if (!env.standalone && installEvt) return 'install';
  return null;
}

/** Prompt card shown inside the portal / CRM until the device is set up. */
export async function promptCard(profile) {
  if (document.querySelector('.onboard')) return;
  const staff = profile.role !== 'customer';
  const step = await nextStep();
  if (!step || step === 'denied') return;
  const snooze = Number(localStorage.getItem('sb-push-snooze') || 0);
  if (Date.now() < snooze) return;
  if (document.querySelector('.modal, .viewer')) { setTimeout(() => promptCard(profile), 3000); return; }
  const why = staff ? 'Get an alert the moment a website inquiry or customer message comes in.' : 'Get an alert when the Stratabench team replies or shares files with you.';
  const later = h('button', { class: 'btn ghost sm' }, 'Not now');
  const close = () => card.remove();
  later.onclick = () => { localStorage.setItem('sb-push-snooze', String(Date.now() + 3 * 864e5)); close(); };
  let body, actions = [];
  if (step === 'install' && env.ios) {
    body = [h('b', {}, 'Add Stratabench to your Home Screen'), h('p', {}, why + ' On iPhone and iPad, notifications work once the app is on your Home Screen.'), iosSteps()];
  } else if (step === 'install') {
    const go = h('button', { class: 'btn primary sm' }, 'Install app');
    go.onclick = async () => { if (await promptInstall()) close(); };
    body = [h('b', {}, 'Install the Stratabench app'), h('p', {}, 'Open the portal from your home screen or dock like an app.')]; actions = [go];
  } else {
    const go = h('button', { class: 'btn primary sm' }, icon('bell'), 'Turn on notifications');
    go.onclick = async () => { go.disabled = true; try { await enable(); toast('Notifications are on for this device.'); close(); sendTest().catch(() => {}); } catch (e) { toast(e.message, true); go.disabled = false; } };
    body = [h('b', {}, 'Turn on notifications'), h('p', {}, why)]; actions = [go];
  }
  const card = h('div', { class: 'onboard', role: 'region', 'aria-label': 'Set up the app' },
    h('img', { src: '/img/icon-192.png', alt: '', width: 44, height: 44 }),
    h('div', { class: 'onboard-body' }, ...body, h('div', { class: 'row', style: 'gap:.5rem;margin-top:.6rem;flex-wrap:wrap' }, ...actions, later)),
    h('button', { class: 'icon-btn', 'aria-label': 'Dismiss', onclick: later.onclick }, icon('x')));
  document.body.append(card);
}

/** Settings dialog from the bell button. */
export async function settingsDialog(profile) {
  const staff = profile.role !== 'customer';
  const body = h('div', { class: 'grid', style: 'gap:1rem' });
  const render = async () => {
    body.innerHTML = '';
    const sub = await currentSub().catch(() => null);
    const perm = env.pushable ? Notification.permission : 'unsupported';
    const on = perm === 'granted' && sub;
    body.append(h('p', { class: 'muted' }, staff ? 'You will be notified about new website inquiries and customer messages.' : 'You will be notified when the Stratabench team sends you a message or files. Notifications never include project details.'));
    const status = env.ios && !env.standalone ? 'Add Stratabench to your Home Screen first' : on ? 'On for this device' : perm === 'denied' ? 'Blocked in device settings' : perm === 'unsupported' ? 'Not supported in this browser' : 'Off';
    body.append(h('div', { class: 'row', style: 'justify-content:space-between;gap:1rem;flex-wrap:wrap' }, h('div', {}, h('b', {}, 'Notifications'), h('div', { class: 'muted xs' }, status)),
      h('div', { class: 'row', style: 'gap:.5rem' },
        on ? h('button', { class: 'btn ghost sm', onclick: async () => { try { await sendTest(); toast('Test sent. It should arrive in a few seconds.'); } catch (e) { toast(e.message, true); } } }, 'Send test') : null,
        on ? h('button', { class: 'btn ghost sm', onclick: async () => { await disable(); toast('Notifications turned off for this device.'); render(); } }, 'Turn off')
           : (perm === 'default' || (perm === 'granted' && !sub)) && env.pushable ? h('button', { class: 'btn primary sm', onclick: async (e) => { e.target.disabled = true; try { await enable(); toast('Notifications are on.'); sendTest().catch(() => {}); render(); } catch (er) { toast(er.message, true); e.target.disabled = false; } } }, 'Turn on') : null)));
    if (perm === 'denied' && !(env.ios && !env.standalone)) body.append(h('p', { class: 'xs muted' }, env.ios ? 'Open the iPhone Settings app → Notifications → Stratabench, and allow notifications.' : 'Click the lock or site-settings icon next to the address bar and allow notifications for stratabench.com.'));
    if (!env.standalone) {
      body.append(h('hr', { class: 'sep' }), h('b', {}, 'Home Screen app'));
      if (env.ios) body.append(iosSteps());
      else if (installEvt) body.append(h('button', { class: 'btn ghost sm', style: 'justify-self:start', onclick: async () => { if (await promptInstall()) render(); } }, 'Install app'));
      else body.append(h('p', { class: 'xs muted' }, env.android ? 'In Chrome, open the ⋮ menu and tap Add to Home screen (or Install app).' : 'In Chrome or Edge, use the install icon in the address bar. In Safari on Mac, choose File → Add to Dock.'));
    } else body.append(h('p', { class: 'xs muted' }, 'You are using the installed Stratabench app.'));
  };
  await render();
  modal({ title: 'Notifications and app', body, actions: [{ label: 'Done', kind: 'primary' }] });
}

/** Boot inside portal/crm: keep registration fresh and show the prompt. */
export function boot(profile) {
  refresh();
  setTimeout(() => promptCard(profile), 1800);
  document.addEventListener('sb-installable', () => promptCard(profile));
  // clear the app badge when the app is opened
  navigator.clearAppBadge?.().catch?.(() => {});
}
