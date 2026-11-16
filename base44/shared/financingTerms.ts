// Indicative Elite in-house financing terms for the exact balance Elite would
// finance: the offer total after assistance minus the verified deposit.
//
// Everything in this module runs on the server. The customer page can only pick
// one of these terms; it never supplies a price, an APR or a monthly payment.
// The regular scheduled installment must stay at or above the configured
// minimum (default $100), so the longest allowed term is derived per balance.

export const DEFAULT_MIN_TERM_MONTHS = 3;
export const DEFAULT_MAX_TERM_MONTHS = 24;
export const DEFAULT_MIN_MONTHLY_PAYMENT = 100;

const round2 = (value: any) => Math.round((Number(value) || 0) * 100 + Number.EPSILON) / 100;
const cents = (value: any) => Math.round((Number(value) || 0) * 100);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function financingTermLimits(settings: any) {
  const rawMin = Math.round(Number(settings?.internal_financing_min_term_months));
  const minTerm = clamp(Number.isFinite(rawMin) && rawMin > 0 ? rawMin : DEFAULT_MIN_TERM_MONTHS, 1, 84);
  const rawMax = Math.round(Number(settings?.internal_financing_max_term_months));
  const maxTerm = clamp(Number.isFinite(rawMax) && rawMax > 0 ? rawMax : DEFAULT_MAX_TERM_MONTHS, minTerm, 84);
  const rawMonthly = Number(settings?.internal_financing_min_monthly_payment);
  const minMonthly = clamp(
    Number.isFinite(rawMonthly) && rawMonthly > 0 ? round2(rawMonthly) : DEFAULT_MIN_MONTHLY_PAYMENT,
    1,
    100000,
  );
  const apr = clamp(Number(settings?.internal_financing_apr) || 0, 0, 36);
  return { apr: round2(apr), minTerm, maxTerm, minMonthly };
}

// Fixed-rate amortization. The regular installment is rounded to cents; the
// final installment absorbs any rounding remainder.
export function regularMonthlyPayment(principal: any, apr: any, months: any) {
  const amount = Math.max(0, round2(principal));
  const count = Math.max(1, Math.round(Number(months)) || 1);
  const monthlyRate = (clamp(Number(apr) || 0, 0, 36) / 100) / 12;
  if (amount <= 0) return 0;
  if (monthlyRate === 0) return round2(amount / count);
  return round2((amount * monthlyRate * Math.pow(1 + monthlyRate, count)) / (Math.pow(1 + monthlyRate, count) - 1));
}

export function loanTerms(principal: any, apr: any, months: any) {
  const amount = Math.max(0, round2(principal));
  const count = Math.max(1, Math.round(Number(months)) || 1);
  const aprValue = clamp(Number(apr) || 0, 0, 36);
  const monthlyRate = (aprValue / 100) / 12;
  const regular = regularMonthlyPayment(amount, aprValue, count);
  const rows: any[] = [];
  let balance = amount;
  let totalCents = 0;
  for (let index = 1; index <= count; index += 1) {
    const interest = round2(balance * monthlyRate);
    const payment = index === count ? round2(balance + interest) : regular;
    const principalPart = round2(Math.max(0, payment - interest));
    balance = round2(Math.max(0, balance - principalPart));
    totalCents += cents(payment);
    rows.push({
      number: index,
      amount: payment,
      principal: principalPart,
      interest,
      balance_after: balance,
    });
  }
  const totalRepayable = round2(totalCents / 100);
  return {
    monthly_payment: regular,
    total_repayable: totalRepayable,
    finance_charge: round2(totalRepayable - amount),
    rows,
  };
}

// Every term the customer may choose for this exact balance, with the figures
// Elite would use. A term whose regular installment falls under the minimum is
// flagged and never offered.
export function financingOptions(principal: any, settings: any) {
  const limits = financingTermLimits(settings);
  const amount = Math.max(0, round2(principal));
  const options: any[] = [];
  if (amount > 0) {
    for (let months = limits.minTerm; months <= limits.maxTerm; months += 1) {
      const terms = loanTerms(amount, limits.apr, months);
      options.push({
        term_months: months,
        monthly_payment: terms.monthly_payment,
        total_repayable: terms.total_repayable,
        finance_charge: terms.finance_charge,
        meets_minimum: cents(terms.monthly_payment) >= cents(limits.minMonthly),
      });
    }
  }
  const eligible = options.filter((option) => option.meets_minimum);
  const requestedDefault = Math.round(Number(settings?.internal_financing_term_months) || 0);
  const fallbackTerm = eligible.length ? eligible[eligible.length - 1].term_months : 0;
  const defaultTerm = eligible.some((option) => option.term_months === requestedDefault) ? requestedDefault : fallbackTerm;
  return {
    principal: amount,
    apr: limits.apr,
    min_term_months: limits.minTerm,
    max_term_months: limits.maxTerm,
    min_monthly_payment: limits.minMonthly,
    options,
    eligible_terms: eligible.map((option) => option.term_months),
    max_eligible_term: fallbackTerm,
    default_term_months: defaultTerm,
    can_finance: eligible.length > 0,
    note: eligible.length
      ? `Estimates at ${limits.apr}% APR. Every plan keeps the scheduled payment at or above $${limits.minMonthly.toFixed(2)}.`
      : `No monthly plan on this balance can stay at or above the $${limits.minMonthly.toFixed(2)} minimum installment. Pay in full, or contact Elite about a different arrangement.`,
  };
}

// True when a regular scheduled installment meets the configured minimum. The
// final installment may be smaller; only the regular payment is tested here.
export function meetsMinimumInstallment(monthly: any, settings: any) {
  const limits = financingTermLimits(settings);
  return { ok: cents(monthly) >= cents(limits.minMonthly), minimum: limits.minMonthly };
}

// Server-side quote for one requested term. Returns null when that term is not
// offered for this balance, so a caller can never invent one.
export function financingQuote(principal: any, settings: any, termMonths: any) {
  const plan = financingOptions(principal, settings);
  const term = Math.round(Number(termMonths) || 0);
  const option = plan.options.find((item) => item.term_months === term && item.meets_minimum);
  return { plan, option: option || null };
}