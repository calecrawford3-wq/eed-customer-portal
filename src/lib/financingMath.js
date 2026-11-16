// Display-only mirror of the server's fixed-rate amortization, used by the staff
// panel to show the scheduled payment while a term is being chosen. The server
// recomputes and validates every figure; nothing here is stored.

export const MIN_MONTHLY_PAYMENT = 100;

const round2 = (value) => Math.round((Number(value) || 0) * 100 + Number.EPSILON) / 100;

export function monthlyPaymentFor(principal, apr, months) {
  const amount = Math.max(0, round2(principal));
  const count = Math.max(1, Math.round(Number(months)) || 1);
  const rate = Math.min(36, Math.max(0, Number(apr) || 0)) / 100 / 12;
  if (amount <= 0) return 0;
  if (rate === 0) return round2(amount / count);
  return round2((amount * rate * Math.pow(1 + rate, count)) / (Math.pow(1 + rate, count) - 1));
}

export function meetsMinimumPayment(principal, apr, months, minimum = MIN_MONTHLY_PAYMENT) {
  return Math.round(monthlyPaymentFor(principal, apr, months) * 100) >= Math.round(Number(minimum) * 100);
}