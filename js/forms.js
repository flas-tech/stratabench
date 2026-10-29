import { SUPABASE_URL, SUPABASE_KEY, CONTACT_EMAIL } from './config.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// tabs
const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
tabs.forEach((t) => t.addEventListener('click', () => {
  tabs.forEach((x) => {
    const on = x === t;
    x.setAttribute('aria-selected', on);
    document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
  });
}));
// deep links e.g. #callback
const hashMap = { '#callback': 'tab-callback', '#feedback': 'tab-feedback' };
if (hashMap[location.hash]) { document.getElementById(hashMap[location.hash])?.click(); }

document.querySelectorAll('.lead-form').forEach((form) => {
  const note = form.querySelector('.form-note');
  const btn = form.querySelector('button[type="submit"]');
  const label = btn.textContent;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    note.className = 'form-note';
    const fd = new FormData(form);
    if (fd.get('website')) return; // honeypot
    const missing = [...form.querySelectorAll('[required]')].filter((el) => !el.value.trim());
    const email = (fd.get('email') || '').trim();
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    missing.forEach((el) => el.setAttribute('aria-invalid', 'true'));
    if (missing.length || (email && !EMAIL.test(email))) {
      if (email && !EMAIL.test(email)) form.querySelector('[name="email"]').setAttribute('aria-invalid', 'true');
      note.textContent = 'Please fill in the highlighted fields so we can reply.';
      note.classList.add('err');
      (missing[0] || form.querySelector('[aria-invalid]'))?.focus();
      return;
    }
    const kind = form.dataset.kind;
    const details = {};
    if (fd.get('docs')) details.documents = fd.get('docs');
    const interests = fd.getAll('interest');
    if (interests.length) details.interests = interests;
    const row = {
      kind,
      name: fd.get('name')?.trim(),
      company: fd.get('company')?.trim() || null,
      email: email || null,
      phone: fd.get('phone')?.trim() || null,
      component: fd.get('component')?.trim() || null,
      test_type: fd.get('test_type') || null,
      media: fd.get('media') || null,
      target_date: fd.get('target_date')?.trim() || null,
      message: fd.get('message')?.trim() || null,
      details,
      source_page: location.pathname + location.hash,
    };
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/inquiries`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      });
      if (!r.ok) throw new Error(await r.text());
      form.reset();
      note.textContent = kind === 'feedback'
        ? 'Thanks. Your feedback went straight to the engineering team.'
        : kind === 'callback'
          ? 'Got it. An engineer will call you, usually within two business days.'
          : 'Received. An engineer will review it and, within two business days, set up your secure project portal, where you can upload the CMM / ATP and we\'ll continue the conversation.';
      note.classList.add('ok');
    } catch (err) {
      note.textContent = "That didn't go through. Please check your connection and try again in a moment.";
      note.classList.add('err');
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  });
});
