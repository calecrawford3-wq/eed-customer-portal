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