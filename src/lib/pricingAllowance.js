// Customers never see the pricing allowance as its own line. It is folded into
// each displayed item price instead, derived from the document's own subtotal so
// nothing stored changes and the totals the customer pays stay identical.

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const isSelectedAddon = (addon) => ["preselected", "customer_selected"].includes(addon?.selection_state);

export function allowanceFactor(doc) {
  if (!doc) return 1;
  const parts = (doc.line_items || []).reduce(
    (sum, line) => sum + (Number(line.total) || (Number(line.unit_price) || 0) * (Number(line.quantity) || 0)),
    0
  );
  const labor = (doc.labor_items || []).reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const machining = (doc.machining_items || []).reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0
  );
  const addons = (doc.addons || []).filter(isSelectedAddon).reduce((sum, addon) => sum + (Number(addon.price) || 0), 0);
  const base = parts + labor + machining + addons;
  const subtotal = Number(doc.subtotal) || 0;
  if (base <= 0 || subtotal <= base) return 1;
  const factor = subtotal / base;
  // Anything above a 50% uplift is not a pricing allowance; leave the document as stored.
  return factor <= 1.5 ? factor : 1;
}

// Returns a display-only copy with the allowance baked into every item price.
export function withAllowancePricing(doc) {
  const factor = allowanceFactor(doc);
  if (!doc || factor === 1) return doc;
  return {
    ...doc,
    line_items: (doc.line_items || []).map((line) => {
      const quantity = Number(line.quantity) || 0;
      const unitPrice = round2((Number(line.unit_price) || 0) * factor);
      return {
        ...line,
        unit_price: unitPrice,
        total: quantity ? round2(unitPrice * quantity) : round2((Number(line.total) || 0) * factor),
      };
    }),
    labor_items: (doc.labor_items || []).map((item) => ({ ...item, price: round2((Number(item.price) || 0) * factor) })),
    machining_items: (doc.machining_items || []).map((item) => ({ ...item, price: round2((Number(item.price) || 0) * factor) })),
    addons: (doc.addons || []).map((addon) => ({ ...addon, price: round2((Number(addon.price) || 0) * factor) })),
  };
}