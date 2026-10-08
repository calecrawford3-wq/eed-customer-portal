// Shared currency formatter — exactly two decimal places, consistent cent rounding.
// Use everywhere money is displayed: dashboards, lists, viewers, documents, emails.

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a number as USD currency with exactly two decimal places.
 * @param {number|string|null|undefined} value
 * @returns {string} e.g. "$1,234.50" — returns "$0.00" for null/undefined/NaN
 */
export function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$0.00";
  return USD.format(n);
}

/**
 * Round a monetary amount to the nearest cent (2 decimals) using round-half-up.
 * Use for new monetary calculations to avoid floating-point drift.
 * @param {number|string|null|undefined} value
 * @returns {number}
 */
export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Sum an array of monetary values with cent rounding applied to the total.
 * @param {Array<number>} values
 * @returns {number}
 */
export function sumMoney(values) {
  return roundMoney((values || []).reduce((s, v) => s + (Number(v) || 0), 0));
}

/**
 * Total of all labor line items on an invoice/estimate.
 */
export function laborTotal(doc) {
  return (doc?.labor_items || []).reduce((s, li) => s + (Number(li.price) || 0), 0);
}

/**
 * Total of all machining line items on an invoice/estimate (price × quantity).
 */
export function machiningTotal(doc) {
  return (doc?.machining_items || []).reduce(
    (s, mi) => s + (Number(mi.price) || 0) * (Number(mi.quantity) || 1),
    0
  );
}

/**
 * Total of all core credit / core sale line items on an invoice/estimate.
 * Cores (starters, alternators, etc.) sold from inventory are not taxable
 * goods, so they are excluded from sales-tax reporting along with labor/machining.
 */
export function coreItemsTotal(doc) {
  // Only cores sold from inventory (lines linked to an EngineCore). Core credit
  // lines are negative adjustments already netted into the subtotal — leave them.
  return (doc?.line_items || [])
    .filter((li) => li.core_id && !li.is_core_credit)
    .reduce((s, li) => s + (Number(li.total) || 0), 0);
}

/**
 * Goods-only subtotal: the invoice subtotal with labor, machining, and core
 * items removed. Use this for sales-tax reporting where only taxable tangible
 * goods (parts) count toward taxable/exempt sales — services and cores are not
 * reportable goods.
 */
export function goodsSubtotal(doc) {
  const sub = Number(doc?.subtotal) || 0;
  return Math.max(0, sub - laborTotal(doc) - machiningTotal(doc) - coreItemsTotal(doc));
}