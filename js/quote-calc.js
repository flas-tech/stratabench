// Pure quote math shared by the builder, the print page and tests. No DOM.
export const KINDS = { labor: 'Labor', material: 'Material', purchased: 'Purchased equipment', subcontract: 'Subcontract', travel: 'Travel / site', other: 'Other' };
const n = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Cost and price for one line. rates: {id: {cost_rate, bill_rate, role}}, markups: {kind: pct} */
export function lineMath(l, rates, markups) {
  const qty = n(l.qty) ?? 0;
  const flags = [];
  let unitCost, unitPrice;
  if (l.kind === 'labor') {
    const rate = rates[l.rate_id];
    if (!rate) flags.push('Pick a labor role');
    unitCost = n(rate?.cost_rate);
    unitPrice = n(l.unit_price) ?? n(rate?.bill_rate);
    if (rate && unitCost === null) flags.push(`No cost rate set for ${rate.role}`);
    if (rate && unitPrice === null) flags.push(`No bill rate set for ${rate.role}`);
  } else {
    unitCost = n(l.unit_cost);
    const mk = n(l.markup_pct) ?? n(markups?.[l.kind]) ?? 0;
    unitPrice = n(l.unit_price) ?? (unitCost === null ? null : unitCost * (1 + mk / 100));
    if (unitCost === null && n(l.unit_price) === null) flags.push('Needs a cost');
  }
  if (!qty) flags.push(l.kind === 'labor' ? 'Needs hours' : 'Quantity is 0');
  const cost = r2(qty * (unitCost ?? 0));
  const price = r2(qty * (unitPrice ?? 0));
  if (price && cost > price) flags.push('Priced below cost');
  return { qty, unitCost, unitPrice, cost, price, margin: price ? (price - cost) / price : null, flags };
}

/** Totals for a whole quote. */
export function quoteMath(quote, lines, rates, settings) {
  const markups = settings?.markups || {};
  const per = lines.map((l) => ({ line: l, ...lineMath(l, rates, markups) }));
  const inc = per.filter((p) => !p.line.optional);
  const opt = per.filter((p) => p.line.optional);
  const subtotal = r2(inc.reduce((a, p) => a + p.price, 0));
  const cost = r2(inc.reduce((a, p) => a + p.cost, 0));
  const contPct = n(quote.contingency_pct) ?? 0;
  const contingency = r2(subtotal * contPct / 100);
  const discount = r2(n(quote.discount_amt) ?? 0);
  const shipping = r2(n(quote.shipping_amt) ?? 0);
  const taxable = r2(subtotal + contingency - discount);
  const tax = r2(taxable * (n(quote.tax_pct) ?? 0) / 100);
  const total = r2(taxable + shipping + tax);
  const totalCost = r2(cost + shipping);
  const revenue = taxable + shipping; // excludes tax
  const margin = revenue ? (revenue - totalCost) / revenue : null;
  const marginNoCont = (revenue - contingency) ? (revenue - contingency - totalCost) / (revenue - contingency) : null;
  const byKind = {}; inc.forEach((p) => { const k = p.line.kind; byKind[k] ||= { cost: 0, price: 0 }; byKind[k].cost = r2(byKind[k].cost + p.cost); byKind[k].price = r2(byKind[k].price + p.price); });
  const hoursByRole = {}; inc.filter((p) => p.line.kind === 'labor').forEach((p) => { const role = rates[p.line.rate_id]?.role || 'Unassigned'; hoursByRole[role] = (hoursByRole[role] || 0) + p.qty; });
  const hours = Object.values(hoursByRole).reduce((a, b) => a + b, 0);
  const sections = []; per.forEach((p) => { let s = sections.find((x) => x.name === p.line.section); if (!s) sections.push(s = { name: p.line.section, price: 0, cost: 0, lines: [] }); s.lines.push(p); if (!p.line.optional) { s.price = r2(s.price + p.price); s.cost = r2(s.cost + p.cost); } });
  const ms = (quote.milestones || []).map((m) => ({ ...m, amount: r2(total * (n(m.pct) ?? 0) / 100) }));
  const msPct = ms.reduce((a, m) => a + (n(m.pct) ?? 0), 0);
  { const paid = ms.filter((m) => m.amount); if (paid.length && Math.abs(ms.reduce((a, m) => a + (n(m.pct) ?? 0), 0) - 100) < 0.01) { const last = paid[paid.length - 1]; last.amount = r2(total - paid.slice(0, -1).reduce((a, m) => a + m.amount, 0)); } }
  // price that would hit the target margin with the same cost
  const target = n(settings?.target_margin);
  const priceAtTarget = target !== null && target < 100 ? r2(totalCost / (1 - target / 100)) : null;
  const warnings = [];
  per.forEach((p, i) => p.flags.forEach((f) => warnings.push({ line: p.line, text: `${p.line.description || 'Line ' + (i + 1)}: ${f}` })));
  if (ms.length && Math.abs(msPct - 100) > 0.01) warnings.push({ text: `Payment milestones add up to ${msPct}%, not 100%` });
  if (margin !== null && settings && margin * 100 < Number(settings.min_margin)) warnings.push({ text: `Margin ${(margin * 100).toFixed(1)}% is under the ${settings.min_margin}% minimum`, level: 'bad' });
  if (quote.valid_until && new Date(quote.valid_until + 'T23:59:59') < new Date()) warnings.push({ text: 'Valid-until date has passed' });
  return { per, subtotal, cost, contingency, discount, shipping, tax, total, totalCost, margin, marginNoCont, byKind, hoursByRole, hours, sections, milestones: ms, msPct, priceAtTarget, optionalTotal: r2(opt.reduce((a, p) => a + p.price, 0)), warnings };
}

/** Customer-safe snapshot: prices only, contingency folded into line prices. Never includes cost, rates or margin. */
export function customerSnapshot({ quote, lines, rates, settings, company, contact, preparer }) {
  const m = quoteMath(quote, lines, rates, settings);
  const f = 1 + (Number(quote.contingency_pct) || 0) / 100;
  const sections = m.sections.map((s) => ({
    name: s.name,
    total: r2(s.price * f),
    lines: s.lines.filter((p) => !p.line.optional).map((p) => ({ description: p.line.description, part_number: p.line.part_number || null, qty: p.qty, unit: p.line.kind === 'labor' ? 'hr' : (p.line.unit || 'ea'), amount: r2(p.price * f) })),
  })).filter((s) => s.lines.length);
  // fix rounding so sections add to subtotal + contingency exactly
  const want = r2(m.subtotal + m.contingency); const got = r2(sections.reduce((a, s) => a + s.total, 0));
  if (sections.length && got !== want) sections[sections.length - 1].total = r2(sections[sections.length - 1].total + want - got);
  return {
    v: 1, number: quote.number, revision: quote.revision, title: quote.title, issued: new Date().toISOString().slice(0, 10), valid_until: quote.valid_until || null,
    company: company ? { name: company.name, city: company.city || null, state: company.state || null } : null,
    contact: contact ? { name: contact.full_name, title: contact.title || null, email: contact.email || null } : null,
    prepared_by: preparer ? { name: preparer.full_name || preparer.email, title: preparer.title || null, email: preparer.email } : null,
    scope: quote.scope || '', schedule: quote.schedule || '', assumptions: quote.assumptions || '', exclusions: quote.exclusions || '', terms: quote.terms || '',
    show_line_detail: !!quote.show_line_detail,
    sections,
    options: m.per.filter((p) => p.line.optional).map((p) => ({ section: p.line.section, description: p.line.description, amount: r2(p.price * f) })),
    subtotal: want, discount: m.discount, shipping: m.shipping, tax_pct: Number(quote.tax_pct) || 0, tax: m.tax, total: m.total,
    milestones: m.milestones.filter((x) => Number(x.pct)).map((x) => ({ name: x.name, pct: Number(x.pct), amount: x.amount })),
  };
}
