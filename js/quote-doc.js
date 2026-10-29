// Customer-facing quote document, rendered from a snapshot (see quote-calc.customerSnapshot).
import { h, fmtMoney, fmtDate } from './core.js';
const money = (v) => Number(v || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const para = (t) => t ? String(t).split(/\n{2,}/).map((p) => h('p', {}, p)) : [];
const bullets = (t) => { const items = String(t || '').split('\n').map((x) => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean); return items.length ? h('ul', {}, items.map((x) => h('li', {}, x))) : null; };

export function quoteDocument(s, { status } = {}) {
  const block = (title, ...kids) => kids.flat().filter(Boolean).length ? h('section', { class: 'qd-block' }, h('h3', {}, title), ...kids) : null;
  return h('article', { class: 'qdoc' },
    h('header', { class: 'qd-head' },
      h('div', { class: 'qd-brand' }, h('div', { class: 'qd-wm' }, h('img', { src: '/img/mark.png', alt: '', class: 'qd-logo' }), h('span', {}, 'STRATABENCH')), h('div', { class: 'xs' }, 'Aerospace test systems · stratabench.com')),
      h('div', { class: 'qd-id' }, h('div', { class: 'qd-kicker' }, 'Quotation'), h('div', { class: 'qd-num' }, `${s.number} · Rev ${s.revision}`),
        h('dl', {}, h('dt', {}, 'Issued'), h('dd', {}, fmtDate(s.issued)), h('dt', {}, 'Valid until'), h('dd', {}, s.valid_until ? fmtDate(s.valid_until) : '—')),
        status && status !== 'sent' ? h('div', { class: 'qd-status ' + status }, status === 'accepted' ? 'Accepted' : status === 'declined' ? 'Declined' : status === 'superseded' ? 'Superseded by a newer revision' : status === 'draft' ? 'Draft preview' : status) : null)),
    h('div', { class: 'qd-parties' },
      h('div', {}, h('div', { class: 'qd-label' }, 'Prepared for'), h('b', {}, s.company?.name || '—'), s.contact ? h('div', {}, s.contact.name + (s.contact.title ? `, ${s.contact.title}` : '')) : null, s.company?.city ? h('div', { class: 'muted' }, [s.company.city, s.company.state].filter(Boolean).join(', ')) : null),
      h('div', {}, h('div', { class: 'qd-label' }, 'Prepared by'), h('b', {}, s.prepared_by?.name || 'Stratabench'), s.prepared_by?.title ? h('div', {}, s.prepared_by.title) : null, s.prepared_by?.email ? h('div', { class: 'muted' }, s.prepared_by.email) : null)),
    h('h2', { class: 'qd-title' }, s.title),
    block('Scope of work', ...para(s.scope)),
    h('section', { class: 'qd-block' }, h('h3', {}, 'Pricing'),
      h('table', { class: 'qd-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Item'), s.show_line_detail ? h('th', { class: 'num' }, 'Qty') : null, h('th', { class: 'num' }, 'Amount'))),
        h('tbody', {}, s.sections.flatMap((sec) => [
          h('tr', { class: 'qd-sec' }, h('td', {}, sec.name), s.show_line_detail ? h('td') : null, h('td', { class: 'num' }, money(sec.total))),
          ...(s.show_line_detail ? sec.lines.map((l) => h('tr', { class: 'qd-line' }, h('td', {}, l.description, l.part_number ? h('span', { class: 'muted' }, `  ${l.part_number}`) : null), h('td', { class: 'num' }, `${+l.qty.toFixed(2)} ${l.unit}`), h('td', { class: 'num' }, money(l.amount)))) : []),
        ])),
        h('tfoot', {},
          ...(s.discount || s.shipping || s.tax ? [h('tr', {}, h('td', { colspan: s.show_line_detail ? 2 : 1 }, 'Subtotal'), h('td', { class: 'num' }, money(s.subtotal)))] : []),
          s.discount ? h('tr', {}, h('td', { colspan: s.show_line_detail ? 2 : 1 }, 'Discount'), h('td', { class: 'num' }, '−' + money(s.discount))) : null,
          s.shipping ? h('tr', {}, h('td', { colspan: s.show_line_detail ? 2 : 1 }, 'Crating & freight'), h('td', { class: 'num' }, money(s.shipping))) : null,
          s.tax ? h('tr', {}, h('td', { colspan: s.show_line_detail ? 2 : 1 }, `Tax (${s.tax_pct}%)`), h('td', { class: 'num' }, money(s.tax))) : null,
          h('tr', { class: 'qd-total' }, h('td', { colspan: s.show_line_detail ? 2 : 1 }, 'Total (USD)'), h('td', { class: 'num' }, money(s.total)))))),
    s.options?.length ? h('section', { class: 'qd-block' }, h('h3', {}, 'Optional items (not included in total)'),
      h('table', { class: 'qd-table' }, h('tbody', {}, s.options.map((o) => h('tr', {}, h('td', {}, o.description, h('span', { class: 'muted xs' }, ` · ${o.section}`)), h('td', { class: 'num' }, money(o.amount))))))) : null,
    s.milestones?.length ? h('section', { class: 'qd-block' }, h('h3', {}, 'Payment schedule'),
      h('table', { class: 'qd-table' }, h('tbody', {}, s.milestones.map((m) => h('tr', {}, h('td', {}, m.name), h('td', { class: 'num' }, `${m.pct}%`), h('td', { class: 'num' }, money(m.amount))))))) : null,
    block('Schedule', ...para(s.schedule)),
    h('div', { class: 'qd-cols' }, block('Assumptions', bullets(s.assumptions)), block('Exclusions', bullets(s.exclusions))),
    block('Terms', ...para(s.terms)),
    h('footer', { class: 'qd-foot' }, `${s.number} Rev ${s.revision} · Stratabench · Flite Line Aviation Services, LLC · Accept or ask questions in your Stratabench portal.`));
}
