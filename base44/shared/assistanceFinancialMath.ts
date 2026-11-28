// Pure financial-review checks. No provider calls, authorization or funding decisions.
// Amounts are integer cents; positive amounts add to the account balance.
const DAY = 86400000;
const CATEGORIES = new Set(['income', 'transfer', 'debt_payment', 'other', 'unreviewed']);

function text(value, max = 180) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\d{5,}/g, '[redacted]').trim().slice(0, max)
    : '';
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const result = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(result) && new Date(result).toISOString().slice(0, 10) === value ? result : null;
}

function todayValue(now) {
  const value = new Date(now);
  if (!Number.isFinite(value.getTime())) return null;
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function cents(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 1000000000000;
}

function identity(value) {
  return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function monthNumber(date) {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function unique(items) {
  return [...new Set(items)];
}

/** Validate provider-extracted metadata, never client-declared statement dates. */
export function validateStatementMetadata(extracted, physicalPageCount, now = Date.now()) {
  const source = extracted && typeof extracted === 'object' && !Array.isArray(extracted) ? extracted : {};
  const issues = [];
  const today = todayValue(now);
  const start = dateValue(source.period_start);
  const end = dateValue(source.period_end);
  const normalized = {
    period_start: start === null ? '' : source.period_start,
    period_end: end === null ? '' : source.period_end,
    institution_name: text(source.institution_name),
    account_holder_name: text(source.account_holder_name),
    account_last4: typeof source.account_last4 === 'string' && /^\d{4}$/.test(source.account_last4) ? source.account_last4 : '',
    currency: typeof source.currency === 'string' && /^[a-z]{3}$/i.test(source.currency.trim()) ? source.currency.toLowerCase().trim() : '',
    reported_page_count: Number.isInteger(source.reported_page_count) ? source.reported_page_count : 0,
    all_pages_present: source.all_pages_present === true,
    transactions_complete: source.transactions_complete === true,
    transactions: [],
  };

  if (source.is_bank_statement !== true) issues.push('The file could not be identified as a bank statement.');
  if (source.readable !== true) issues.push('The statement is not fully readable. Upload a clear PDF with every page.');
  if (!Number.isInteger(physicalPageCount) || physicalPageCount < 1 || physicalPageCount > 60) issues.push('The PDF must contain between 1 and 60 pages.');
  if (!normalized.all_pages_present || normalized.reported_page_count !== physicalPageCount) issues.push('All statement pages must be present, with the page count matching the PDF.');
  if (!normalized.institution_name) issues.push('The bank name could not be read.');
  if (!normalized.account_holder_name) issues.push('The account holder name could not be read.');
  if (!normalized.account_last4) issues.push('The last four account digits could not be read.');
  if (normalized.currency !== 'usd') issues.push('A reviewer must check statements that are not identified as U.S. dollars.');
  if (start === null || end === null) issues.push('The full statement start and end dates could not be read.');
  else {
    const length = (end - start) / DAY + 1;
    if (length < 27 || length > 35) issues.push('Each file must be one complete monthly statement, covering 27 to 35 days.');
    if (today === null || start > today || end > today) issues.push('Statement dates cannot be in the future.');
  }

  for (const name of ['opening_balance_cents', 'closing_balance_cents', 'total_deposits_cents', 'total_withdrawals_cents']) {
    const value = source[name];
    if (value === undefined || value === null) continue;
    if (!cents(value) || (name.startsWith('total_') && value < 0)) issues.push('A statement balance or total could not be read as a valid amount.');
    else normalized[name] = value;
  }
  const opening = normalized.opening_balance_cents;
  const closing = normalized.closing_balance_cents;
  const deposits = normalized.total_deposits_cents;
  const withdrawals = normalized.total_withdrawals_cents;
  if ([opening, closing, deposits, withdrawals].every(cents) && Math.abs(opening + deposits - withdrawals - closing) > 1) {
    issues.push('The opening balance, deposits, withdrawals and closing balance do not reconcile. A reviewer must check the statement.');
  }

  const transactions = Array.isArray(source.transactions) ? source.transactions : [];
  if (transactions.length > 1500) issues.push('The statement contains more transactions than this review can extract at once.');
  let invalidRows = false;
  for (const item of transactions.slice(0, 1500)) {
    const date = dateValue(item?.date);
    if (date === null || !cents(item?.amount_cents) || !text(item?.description) || today === null || date > today || (start !== null && date < start) || (end !== null && date > end)) {
      invalidRows = true;
      continue;
    }
    normalized.transactions.push({ date: item.date, description: text(item.description, 240), amount_cents: item.amount_cents, status: 'posted' });
  }
  if (invalidRows) issues.push('Some extracted transaction dates or amounts need a reviewer check.');
  if (normalized.transactions_complete) {
    const extractedDeposits = normalized.transactions.reduce((total, item) => total + Math.max(0, item.amount_cents), 0);
    const extractedWithdrawals = normalized.transactions.reduce((total, item) => total + Math.max(0, -item.amount_cents), 0);
    if ((cents(deposits) && Math.abs(extractedDeposits - deposits) > 1) || (cents(withdrawals) && Math.abs(extractedWithdrawals - withdrawals) > 1)) {
      issues.push('The extracted transactions do not match the statement totals. A reviewer must check the statement.');
    }
  }
  for (const warning of (Array.isArray(source.warnings) ? source.warnings : []).slice(0, 8)) {
    const message = text(warning, 200);
    if (message) issues.push('Document check: ' + message);
  }
  return { ready: issues.length === 0, issues: unique(issues), normalized };
}

/** Count only distinct, accepted monthly statements for one consistent bank account. */
export function evaluateStatementSet(statements, requiredMonths = 3, now = Date.now()) {
  const required = requiredMonths === 6 ? 6 : 3;
  const invalidRequirement = ![3, 6].includes(requiredMonths);
  const today = todayValue(now);
  const rows = Array.isArray(statements) ? statements : [];
  const issues = [];
  const hashes = new Set();
  const periods = new Set();
  const ids = new Set();
  const groups = new Map();
  let duplicates = 0;
  let invalidReady = false;
  let waiting = 0;
  for (const row of rows) {
    if (row?.status !== 'ready') { if (row?.status !== 'rejected') waiting++; continue; }
    const start = dateValue(row.period_start);
    const end = dateValue(row.period_end);
    const bank = identity(row.institution_name);
    const owner = identity(row.account_holder_name);
    const last4 = typeof row.account_last4 === 'string' && /^\d{4}$/.test(row.account_last4) ? row.account_last4 : '';
    const hash = typeof row.sha256 === 'string' ? row.sha256.toLowerCase() : '';
    if (!row.id || typeof row.id !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || start === null || end === null || today === null || end > today || start > today || (end - start) / DAY + 1 < 27 || (end - start) / DAY + 1 > 35 || !bank || !owner || !last4 || String(row.currency || '').toLowerCase() !== 'usd') {
      invalidReady = true;
      continue;
    }
    const key = bank + '|' + last4 + '|' + owner;
    const periodKey = key + '|' + row.period_start + '|' + row.period_end;
    if (hashes.has(hash) || ids.has(row.id) || periods.has(periodKey)) { duplicates++; continue; }
    hashes.add(hash); ids.add(row.id); periods.add(periodKey);
    const group = groups.get(key) || [];
    group.push({ ...row, _start: start, _end: end });
    groups.set(key, group);
  }

  const candidates = [];
  for (const group of groups.values()) {
    group.sort((a, b) => b._end - a._end || b._start - a._start || String(a.id).localeCompare(String(b.id)));
    // A revised statement from the same month cannot stand in for another month.
    const monthEnds = new Set();
    const monthly = group.filter(row => {
      const month = row.period_end.slice(0, 7);
      if (monthEnds.has(month)) { duplicates++; return false; }
      monthEnds.add(month); return true;
    });
    const chosen = monthly.slice(0, required);
    const reasons = [];
    if (chosen.length < required) reasons.push(`Provide ${required} consecutive monthly statements for the same account; ${chosen.length} accepted ${chosen.length === 1 ? 'statement is' : 'statements are'} available.`);
    if (chosen.length && (today - chosen[0]._end) / DAY > 45) reasons.push('The latest statement must end within the past 45 days. Upload the newest statement.');
    let uncovered = 0;
    for (let index = 1; index < chosen.length; index++) {
      const newer = chosen[index - 1];
      const older = chosen[index];
      const gap = (newer._start - older._end) / DAY - 1;
      if (monthNumber(newer.period_end) - monthNumber(older.period_end) !== 1) reasons.push('A monthly statement is missing between the uploaded periods.');
      if (gap < 0) reasons.push('Statement periods overlap. Upload separate consecutive monthly statements.');
      else if (gap > 3) reasons.push('There is a gap between statement periods. Upload the missing statement or have Elite review the dates.');
      else uncovered += gap;
    }
    const coverage = chosen.reduce((total, row) => total + (row._end - row._start) / DAY + 1, 0);
    candidates.push({ chosen, reasons: unique(reasons), coverage, uncovered, available: monthly.length, complete: reasons.length === 0 });
  }
  candidates.sort((a, b) => Number(b.complete) - Number(a.complete) || b.chosen.length - a.chosen.length || (b.chosen[0]?._end || 0) - (a.chosen[0]?._end || 0));
  const best = candidates[0];
  if (invalidRequirement) issues.push('The statement requirement must be three or six months.');
  if (invalidReady) issues.push('An accepted statement has incomplete or invalid dates, account details, or file identification. Elite must review it.');
  if (duplicates) issues.push('Duplicate files or statement months do not count toward the required months.');
  if (waiting) issues.push(`${waiting} uploaded ${waiting === 1 ? 'file still needs' : 'files still need'} extraction or a reviewer check.`);
  if (groups.size > 1 && !best?.complete) issues.push('Statements from different accounts cannot be combined to fill missing months.');
  if (!best) issues.push(`Upload ${required} consecutive monthly bank statements with every page included.`);
  else {
    issues.push(...best.reasons);
    if (best.complete && best.coverage < required * 30) issues.push(`${best.coverage} statement days are available; ${required * 30} days are preferred. Full calendar months may be shorter.`);
    if (best.uncovered) issues.push(`${best.uncovered} ${best.uncovered === 1 ? 'day is' : 'days are'} not covered between the statement periods; the reviewer should confirm the bank's statement cycle.`);
  }
  const chosen = best?.chosen || [];
  return {
    complete: !!best?.complete && !invalidReady && !invalidRequirement,
    received: best?.available || 0,
    required,
    coverage_days: best?.coverage || 0,
    issues: unique(issues),
    statement_ids: chosen.map(row => row.id),
    earliest: chosen.length ? chosen[chosen.length - 1].period_start : null,
    latest: chosen.length ? chosen[0].period_end : null,
  };
}

function inferredCategory(description, amount) {
  if (/\b(transfer|zelle|venmo|cash ?app|paypal|refund|reversal|loan proceeds|loan advance|disbursement)\b/i.test(description)) return 'transfer';
  if (amount > 0 && /\b(payroll|salary|wages|pension|social security|ssa treas|retirement|paycheck)\b/i.test(description)) return 'income';
  if (amount < 0 && /\b(loan payment|auto loan|auto payment|mortgage|credit card payment|credit card pmt|card payment|student loan|installment|affirm|klarna|afterpay)\b/i.test(description)) return 'debt_payment';
  return 'unreviewed';
}

/** Cash-flow observations, with explicitly provisional income/debt classification. */
export function summarizeTransactions(transactions, corrections = [], now = Date.now(), options = {}) {
  const today = todayValue(now);
  const requestedDays = Number.isInteger(options.requestedDays) && options.requestedDays > 0 ? Math.min(180, options.requestedDays) : 90;
  const byId = new Map();
  const correctionMap = new Map();
  let invalid = 0;
  let pending = 0;
  let nonUsd = 0;
  for (const row of Array.isArray(transactions) ? transactions : []) {
    if (!row || typeof row.id !== 'string' || !row.id) { invalid++; continue; }
    byId.set(row.id, row); // Last provider state wins, including posted -> void.
  }
  for (const correction of Array.isArray(corrections) ? corrections : []) {
    if (typeof correction?.transaction_id === 'string' && CATEGORIES.has(correction.category)) correctionMap.set(correction.transaction_id, correction.category);
  }
  const usable = [];
  const months = new Map();
  for (const row of byId.values()) {
    if (row.status === 'void') continue;
    if (row.status === 'pending') { pending++; continue; }
    if (row.status !== 'posted' || !cents(row.amount_cents)) { invalid++; continue; }
    const date = dateValue(row.date);
    if (date === null || today === null || date > today) { invalid++; continue; }
    if (String(row.currency || '').toLowerCase() !== 'usd') { nonUsd++; continue; }
    const description = text(row.description, 240) || 'Transaction';
    const corrected = correctionMap.get(row.id);
    const stored = CATEGORIES.has(row.category) ? row.category : 'unreviewed';
    // Explicit reviewer 'unreviewed' resets a prior label; do not infer over it.
    const category = corrected !== undefined ? corrected : stored !== 'unreviewed' ? stored : inferredCategory(description, row.amount_cents);
    const item = { ...row, description, category, _date: date };
    usable.push(item);
    const key = row.date.slice(0, 7);
    const monthly = months.get(key) || { month: key, inflows_cents: 0, outflows_cents: 0, net_cents: 0, income_candidates_cents: 0, debt_payments_cents: 0, count: 0 };
    monthly.inflows_cents += Math.max(0, row.amount_cents);
    monthly.outflows_cents += Math.max(0, -row.amount_cents);
    monthly.net_cents += row.amount_cents;
    if (category === 'income' && row.amount_cents > 0) monthly.income_candidates_cents += row.amount_cents;
    if (category === 'debt_payment' && row.amount_cents < 0) monthly.debt_payments_cents += -row.amount_cents;
    monthly.count++;
    months.set(key, monthly);
  }
  usable.sort((a, b) => a._date - b._date || a.id.localeCompare(b.id));
  const groups = new Map();
  for (const row of usable) {
    if (!row.amount_cents || row.category === 'transfer') continue;
    const merchant = row.description.toLowerCase().replace(/\[redacted\]/g, '').replace(/\d+/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (merchant.length < 3) continue;
    const direction = row.amount_cents > 0 ? 'inflow' : 'outflow';
    const key = String(row.account_id || '') + '|' + direction + '|' + merchant;
    const group = groups.get(key) || [];
    group.push(row); groups.set(key, group);
  }
  const recurring = [];
  for (const group of groups.values()) {
    if (group.length < 3 || new Set(group.map(row => row.date.slice(0, 7))).size < 2) continue;
    const intervals = group.slice(1).map((row, index) => (row._date - group[index]._date) / DAY);
    const ordered = intervals.slice().sort((a, b) => a - b);
    const median = ordered[Math.floor(ordered.length / 2)];
    const band = median >= 5 && median <= 9 ? [4, 10] : median >= 12 && median <= 17 ? [10, 19] : median >= 25 && median <= 35 ? [23, 38] : null;
    if (!band || intervals.filter(days => days >= band[0] && days <= band[1]).length < Math.ceil(intervals.length * 0.8)) continue;
    const amounts = group.map(row => Math.abs(row.amount_cents));
    const average = amounts.reduce((total, amount) => total + amount, 0) / amounts.length;
    if (!average || (Math.max(...amounts) - Math.min(...amounts)) / average > 0.5) continue;
    recurring.push({ description: group[group.length - 1].description, count: group.length, average_cents: Math.round(average), direction: group[0].amount_cents > 0 ? 'inflow' : 'outflow' });
  }
  recurring.sort((a, b) => b.average_cents - a.average_cents || a.description.localeCompare(b.description));
  const earliest = usable[0]?.date || null;
  const latest = usable[usable.length - 1]?.date || null;
  const days = earliest && latest ? (dateValue(latest) - dateValue(earliest)) / DAY + 1 : 0;
  const flags = [
    'Income, recurring deposits and debt-payment indicators are estimates until a reviewer confirms them. Gross deposits are not verified income.',
    'Coverage shows dates of received transactions, not proof that the bank supplied every day of history. Gross inflows and outflows include transfers.',
  ];
  if (days < requestedDays) flags.push(`Observed transactions span ${days} days; ${requestedDays} days were requested. Additional statements may be needed.`);
  if (options.truncated === true) flags.push('The transaction retrieval limit was reached. The totals are incomplete; obtain additional records before finishing the review.');
  if (pending) flags.push(`${pending} pending ${pending === 1 ? 'transaction is' : 'transactions are'} excluded from posted totals.`);
  if (nonUsd) flags.push(`${nonUsd} non-USD ${nonUsd === 1 ? 'transaction is' : 'transactions are'} excluded. Currencies have not been combined or converted.`);
  if (invalid) flags.push(`${invalid} ${invalid === 1 ? 'record has' : 'records have'} an invalid, future or unsupported value and ${invalid === 1 ? 'was' : 'were'} excluded.`);
  if (earliest && latest) {
    const end = new Date(dateValue(latest));
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    if (!earliest.endsWith('-01') || Number(latest.slice(-2)) !== lastDay) flags.push('The first or last calendar month is partial. Do not compare partial monthly totals with a full month of income.');
  }
  return {
    monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    recurring: recurring.slice(0, 30),
    flags,
    coverage: { earliest, latest, days, requested_days: requestedDays, truncated: options.truncated === true },
  };
}
