// Browser copy of the transaction classification helpers used by the financial review screen.
// The authoritative checks live in base44/shared/assistanceFinancialMath.ts (server only);
// this module only suggests and displays categories and never makes a funding decision.

export const CATEGORIES = new Set(['income', 'employment_income', 'business_income', 'other_income', 'transfer', 'debt_payment', 'housing', 'utilities', 'insurance', 'groceries', 'fuel', 'dining', 'shopping', 'entertainment', 'refund', 'fees', 'other', 'unreviewed']);

export function inferredCategory(description, amount) {
  const d = String(description || '').toLowerCase();
  if (/\b(refund|reversal|returned purchase)\b/.test(d)) return 'refund';
  if (/\b(transfer|zelle|venmo|cash ?app|paypal|loan proceeds|loan advance|disbursement)\b/.test(d)) return 'transfer';
  if (amount > 0) {
    if (/\b(payroll|salary|wages|paycheck)\b/.test(d)) return 'employment_income';
    if (/\b(stripe payout|square payout|merchant settlement|merchant payout)\b/.test(d)) return 'business_income';
    if (/\b(pension|social security|ssa treas|retirement benefit|interest paid)\b/.test(d)) return 'other_income';
    return 'unreviewed';
  }
  if (amount >= 0) return 'unreviewed';
  if (/\b(loan payment|auto loan|auto payment|mortgage|credit card payment|credit card pmt|card payment|student loan|installment|affirm|klarna|afterpay)\b/.test(d)) return 'debt_payment';
  if (/\b(rent payment|apartment rent|rent)\b/.test(d)) return 'housing';
  if (/\b(electric|utility|utilities|water bill|internet|comcast|spectrum|at&t)\b/.test(d)) return 'utilities';
  if (/\b(insurance|geico|progressive|state farm)\b/.test(d)) return 'insurance';
  if (/\b(grocery|groceries|aldi|kroger|safeway|whole foods)\b/.test(d)) return 'groceries';
  if (/\b(fuel|gas station|quiktrip|chevron|exxon|shell oil)\b/.test(d)) return 'fuel';
  if (/\b(restaurant|coffee|pizza|mcdonald|doordash|starbucks|taco bell)\b/.test(d)) return 'dining';
  if (/\b(netflix|cinema|movie theater|spotify|hulu)\b/.test(d)) return 'entertainment';
  if (/\b(amazon|walmart|target|ebay|retail)\b/.test(d)) return 'shopping';
  if (/\b(overdraft|service fee|maintenance fee|atm fee)\b/.test(d)) return 'fees';
  return 'unreviewed';
}

// Learn only from explicit reviews within the same application and direction.
export function merchantKey(row) {
  if (!row || !Number.isFinite(row.amount_cents) || !row.amount_cents) return '';
  let d = String(row.description || '').toLowerCase().replace(/\[redacted\]/g, ' ').replace(/\b(?:pos|debit card|card purchase|purchase|recurring payment)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\b\d{4,}\b/g, ' ').trim().replace(/\s+/g, ' ');
  if (/^apple com bill(?: |$)/.test(d)) d = 'apple com bill';
  if (d.length < 5 || /^(transfer|payment|deposit|withdrawal|check|ach|debit|credit|online payment|unknown)(?: \d+)?$/.test(d)) return '';
  return (row.amount_cents > 0 ? 'in:' : 'out:') + d;
}

export function adaptiveCategories(transactions, corrections = []) {
  const byId = new Map(transactions.map(t => [t.id, t]));
  const rules = new Map();
  for (const c of corrections) {
    const key = merchantKey(byId.get(c.transaction_id));
    if (!key || !CATEGORIES.has(c.category)) continue;
    const set = rules.get(key) || new Set();
    set.add(c.category);
    rules.set(key, set);
  }
  const reviewed = new Map(corrections.map(c => [c.transaction_id, c.category]));
  return transactions.map(t => {
    const rule = rules.get(merchantKey(t));
    const learned = rule?.size === 1 && !rule.has('unreviewed') ? [...rule][0] : null;
    const base = inferredCategory(t.description, t.amount_cents);
    return { ...t, suggested_category: learned || base, category: reviewed.get(t.id) ?? learned ?? base, learned_category: !reviewed.has(t.id) && !!learned, classification_conflict: !!rule && rule.size > 1 };
  });
}