/**
 * Oklahoma Sales Tax Rules & OkTAP Filing Helpers
 *
 * Reference: Oklahoma Tax Commission Form STS-20002-C and Schedule J.
 * This is a reporting/filing-preparation module — it does NOT submit returns.
 *
 * All money arithmetic uses integer cents to avoid floating-point errors.
 */

// Oklahoma state sales tax rate (4.5% as of 2024)
export const OK_STATE_TAX_RATE = 0.045;

// --- Schedule J Exemption Categories (all 24 from STS-20002-C) ---
export const SCHEDULE_J_CATEGORIES = [
  { code: "3a", label: "Sales to sales tax permit holders", short: "Permit holders" },
  { code: "3b", label: "Gasoline with state tax paid", short: "Gasoline" },
  { code: "3c", label: "Motor vehicle excise tax", short: "Motor vehicle" },
  { code: "3d", label: "Agricultural sales", short: "Agricultural" },
  { code: "3e", label: "Federal food stamp exemption", short: "Food stamps" },
  { code: "3f", label: "Returned merchandise", short: "Returns" },
  { code: "3g", label: "Manufacturing exemption permit", short: "Manufacturing" },
  { code: "3h", label: "Direct pay permit", short: "Direct pay" },
  { code: "3i", label: "Out-of-state sales", short: "Out-of-state" },
  { code: "3j", label: "Qualified veterans", short: "Veterans" },
  { code: "3k", label: "Churches, schools, governments", short: "Govt/Church/School" },
  { code: "3l", label: "Cigarettes/tobacco", short: "Tobacco" },
  { code: "3m", label: "Bad debt", short: "Bad debt" },
  { code: "3n", label: "Coin-operated devices", short: "Coin-op" },
  { code: "3o", label: "Exports", short: "Exports" },
  { code: "3p", label: "Medicare/Medicaid", short: "Medicare/Medicaid" },
  { code: "3q", label: "Newspapers/periodicals", short: "Newspapers" },
  { code: "3r", label: "Qualifying exempt organizations", short: "Exempt orgs" },
  { code: "3s", label: "Sales tax holiday", short: "Tax holiday" },
  { code: "3t", label: "Gift certificates/gift cards", short: "Gift cards" },
  { code: "3u", label: "Trust authorities", short: "Trust authorities" },
  { code: "3v", label: "Nontaxable services", short: "Nontaxable svc" },
  { code: "3w", label: "Marketplace facilitator sales", short: "Marketplace" },
  { code: "3x", label: "Other legal exemptions", short: "Other" },
];

// --- STS-20002-C Form Line Definitions ---
export const STS_FORM_LINES = [
  { line: 1, label: "Total Sales", desc: "Gross sales of all goods and services" },
  { line: 2, label: "Inventory Consumed / Direct Payment Purchases", desc: "Inventory consumed or purchases subject to direct payment" },
  { line: 3, label: "Total Exemptions (Schedule J)", desc: "Sum of all Schedule J exemption categories" },
  { line: 4, label: "Eligible Food & Food Ingredient Sales", desc: "Eligible food sales (if applicable)" },
  { line: 5, label: "Net Taxable Sales", desc: "Line 1 + Line 2 - Line 3 - Line 4" },
  { line: 6, label: "State Sales Tax", desc: "Net taxable sales × 4.5% state rate" },
  { line: 7, label: "Total City/County Sales Tax", desc: "From STS-20021 jurisdiction worksheet" },
  { line: 8, label: "Total Tax Due", desc: "Line 6 + Line 7" },
  { line: 9, label: "Interest", desc: "Interest on late payment (if applicable)" },
  { line: 10, label: "Penalty", desc: "Penalty for late filing (if applicable)" },
  { line: 11, label: "Total Amount Due", desc: "Line 8 + Line 9 + Line 10" },
];

// --- Transaction Classifications ---
export const TAX_CLASSIFICATIONS = [
  { value: "oklahoma_pickup", label: "Oklahoma Pickup", desc: "Customer pickup in Oklahoma" },
  { value: "out_of_state", label: "Out-of-State Shipping", desc: "Shipped out of state" },
  { value: "customer_owned_rebuild", label: "Customer-Owned Engine Rebuild", desc: "Rebuild of customer's engine" },
  { value: "engine_sale", label: "Complete Engine Sale", desc: "Sale of finished engine" },
  { value: "resale", label: "Resale Exemption", desc: "Sale for resale (3a)" },
  { value: "manufacturing", label: "Manufacturing Exemption", desc: "Manufacturing exemption (3g)" },
  { value: "nontaxable_service", label: "Nontaxable Service", desc: "Nontaxable service (3v)" },
  { value: "needs_review", label: "Needs Tax Review", desc: "Classification uncertain" },
];

// --- Line Item Tax Classes ---
export const LINE_TAX_CLASSES = [
  { value: "taxable_product", label: "Taxable Product" },
  { value: "taxable_labor", label: "Taxable Labor/Service" },
  { value: "nontaxable_service", label: "Nontaxable Service" },
  { value: "out_of_state", label: "Out-of-State Sale" },
  { value: "resale", label: "Resale Exemption" },
  { value: "manufacturing", label: "Manufacturing Exemption" },
  { value: "other_exemption", label: "Other Exemption" },
  { value: "needs_review", label: "Needs Tax Review" },
];

// --- Filing Statuses ---
export const FILING_STATUSES = [
  { value: "not_started", label: "Not Started", color: "bg-slate-100 text-slate-600" },
  { value: "needs_review", label: "Needs Review", color: "bg-amber-100 text-amber-700" },
  { value: "ready_to_file", label: "Ready to File", color: "bg-blue-100 text-blue-700" },
  { value: "filed", label: "Filed", color: "bg-emerald-100 text-emerald-700" },
  { value: "paid", label: "Paid", color: "bg-emerald-100 text-emerald-800" },
];

// --- Decimal-safe money arithmetic (work in integer cents) ---
export const toCents = (n) => Math.round((Number(n) || 0) * 100);
export const fromCents = (c) => Math.round(c) / 100;
export const addMoney = (...vals) => fromCents(vals.reduce((s, v) => s + toCents(v), 0));
export const subMoney = (a, b) => fromCents(toCents(a) - toCents(b));
export const mulMoney = (amount, rate) => fromCents(Math.round(toCents(amount) * (Number(rate) || 0)));
export const roundMoney = (n) => fromCents(toCents(n));

// Oklahoma state tax: round(taxable * 4.5%)
export const calcStateTax = (taxableSales) => mulMoney(taxableSales, OK_STATE_TAX_RATE);

// City/county tax from jurisdiction rate
export const calcJurisdictionTax = (taxableSales, rate) => mulMoney(taxableSales, rate);

// --- Period helpers ---
export const formatPeriod = (year, month) => `${year}-${String(month + 1).padStart(2, "0")}`;
export const formatPeriodLabel = (year, month) =>
  new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

// --- Validation checks ---
export const validateFiling = (calc) => {
  const errors = [];
  const warnings = [];

  // Total exemptions cannot exceed gross sales
  if (calc.totalExemptions > calc.grossSales) {
    errors.push(`Total exemptions ($${calc.totalExemptions.toFixed(2)}) exceed gross sales ($${calc.grossSales.toFixed(2)})`);
  }

  // Taxable + exempt should reconcile to gross (after adjustments)
  const reconciled = addMoney(calc.taxableSales, calc.exemptSales, calc.adjustments);
  const grossCheck = addMoney(calc.grossSales, calc.inventoryConsumed);
  if (Math.abs(subMoney(reconciled, grossCheck)) > 0.01) {
    warnings.push(`Taxable + exempt + adjustments ($${reconciled.toFixed(2)}) does not equal gross + inventory consumed ($${grossCheck.toFixed(2)})`);
  }

  // Tax collected vs calculated liability
  const diff = subMoney(calc.taxCollected, calc.totalTaxDue);
  if (Math.abs(diff) > 0.01) {
    warnings.push(`Tax collected ($${calc.taxCollected.toFixed(2)}) differs from calculated liability ($${calc.totalTaxDue.toFixed(2)}) by $${diff.toFixed(2)}`);
  }

  // Unclassified transactions
  if (calc.unclassifiedCount > 0) {
    warnings.push(`${calc.unclassifiedCount} transaction(s) need tax classification review`);
  }

  return { errors, warnings };
};