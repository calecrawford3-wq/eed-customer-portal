// Shared job profitability computation: quoted vs actual.
//
// Quoted figures come from the approved estimate (what was promised to the customer).
// Actual figures come from consumed reservations (parts), logged task time (labor),
// invoice totals (revenue/discount/tax), machining cost tracking, and the build's
// warranty cost.
//
// Principles:
//   - Revenue is BEFORE tax. Tax collected is tracked separately (not revenue).
//   - Credits/payments are tracked separately from operating costs (not costs).
//   - Discounts reduce revenue, not costs (avoid double-counting).
//   - Cost snapshots on consumed reservations preserve historical parts cost
//     so later catalog price changes do not rewrite history.
//   - Missing costs are flagged, NOT treated as zero — unknown != free.
//   - An explicit $0 is valid (e.g. $0 internal labor rate for owner draws) and
//     is NOT flagged as missing.
//   - Machining cost is tracked per-item as in_house or outsourced:
//       in_house   → cost is covered by logged labor hours (no separate vendor cost)
//       outsourced → actual vendor cost is recorded (null = missing, 0 = explicit $0)
//       unspecified → flagged as missing (must be classified)
//   - The customer's machining charge (price) is NEVER used as the actual cost.
//   - Overhead burden is always applied to logged hours, even when the internal
//     labor rate is $0.
//   - Estimated and actual margin are shown separately.

export { computeJobProfitability, roundMoney };

function roundMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Compute the full quoted-vs-actual profitability breakdown for a job.
 *
 * @param {object} base44 - service-role client
 * @param {{ job_id: string, settings?: object }} args
 * @returns {Promise<object>} profitability report
 */
async function computeJobProfitability(base44, { job_id, settings }) {
  // Load job
  const jobRes = await base44.entities.Job.filter({ id: job_id });
  const job = (jobRes.items || jobRes || [])[0];
  if (!job) throw new Error("Job not found");

  // Load settings (for internal labor rate + overhead)
  let laborRate = 0;
  let overheadRate = 0;
  if (settings) {
    laborRate = Number(settings.internal_labor_rate) || 0;
    overheadRate = Number(settings.labor_overhead_rate) || 0;
  } else {
    const sRes = await base44.entities.AppSettings.filter({ key: "global" });
    const s = (sRes.items || sRes || [])[0];
    laborRate = Number(s?.internal_labor_rate) || 0;
    overheadRate = Number(s?.labor_overhead_rate) || 0;
  }

  // Load estimate (quoted figures)
  let estimate = null;
  if (job.estimate_id) {
    const eRes = await base44.entities.Estimate.filter({ id: job.estimate_id });
    estimate = (eRes.items || eRes || [])[0];
  }

  // Load build (warranty cost)
  let build = null;
  if (job.build_id) {
    const bRes = await base44.entities.EngineBuild.filter({ id: job.build_id });
    build = (bRes.items || bRes || [])[0];
  }

  // Load invoices (actual revenue + machining cost tracking)
  let invoices = [];
  if (job.invoice_ids?.length) {
    const iRes = await base44.entities.Invoice.filter({ id: { $in: job.invoice_ids } });
    invoices = iRes.items || iRes || [];
  } else if (job.build_id) {
    const iRes = await base44.entities.Invoice.filter({ build_id: job.build_id });
    invoices = iRes.items || iRes || [];
  }

  // Load consumed reservations (actual parts cost)
  let reservations = [];
  if (job.estimate_id) {
    const rRes = await base44.entities.PartReservation.filter({ estimate_id: job.estimate_id });
    reservations = rRes.items || rRes || [];
  }

  // Load tasks (actual labor hours)
  let tasks = [];
  if (job.build_id) {
    const tRes = await base44.entities.BuildTask.filter({ build_id: job.build_id }, "sort_order", 500);
    tasks = tRes.items || tRes || [];
  }

  // Load additional work (approved, applied to invoice)
  const awRes = await base44.entities.AdditionalWork.filter({ job_id });
  const additionalWorks = awRes.items || awRes || [];

  // --- QUOTED (from estimate) ---
  const quoted = computeQuoted(estimate, additionalWorks);

  // --- ACTUAL (from invoices, consumed reservations, tasks, build) ---
  const actual = computeActual(invoices, reservations, tasks, build, laborRate, overheadRate);

  // --- Margins ---
  const estimatedMargin = quoted.revenueBeforeTax > 0
    ? roundMoney((quoted.revenueBeforeTax - quoted.totalCost) / quoted.revenueBeforeTax * 100)
    : null;
  const actualMargin = actual.revenueBeforeTax > 0
    ? roundMoney((actual.revenueBeforeTax - actual.totalCost) / actual.revenueBeforeTax * 100)
    : null;

  return {
    job_id,
    job_number: job.job_number,
    is_complete: build?.status === "complete" || build?.status === "shipped",
    quoted,
    actual,
    tax_collected: actual.taxCollected,
    credits_applied: actual.creditsApplied,
    payments_received: actual.paymentsReceived,
    estimated_margin_pct: estimatedMargin,
    actual_margin_pct: actualMargin,
    missing_costs: actual.missingCosts,
    warnings: buildWarnings(actual.missingCosts),
  };
}

// --- Quoted computation (from approved estimate + approved additional work) ---

function computeQuoted(estimate, additionalWorks) {
  if (!estimate) {
    return { revenueBeforeTax: 0, partsCost: 0, laborRevenue: 0, machiningRevenue: 0, discount: 0, totalCost: 0, hasEstimate: false };
  }

  // Parts revenue and cost from line items
  let partsRevenue = 0;
  let partsCost = 0;
  for (const li of (estimate.line_items || [])) {
    if (li.is_core_credit) continue;
    const qty = Number(li.quantity) || 0;
    partsRevenue += (Number(li.unit_price) || 0) * qty;
    partsCost += (Number(li.unit_cost) || 0) * qty;
  }

  // Labor revenue
  let laborRevenue = 0;
  for (const lab of (estimate.labor_items || [])) {
    laborRevenue += Number(lab.price) || 0;
  }

  // Machining revenue
  let machiningRevenue = 0;
  for (const m of (estimate.machining_items || [])) {
    machiningRevenue += (Number(m.price) || 0) * (Number(m.quantity) || 1);
  }

  // Addons (selected)
  for (const addon of (estimate.addons || [])) {
    if (!["preselected", "customer_selected"].includes(addon.selection_state)) continue;
    for (const li of (addon.line_items || [])) {
      partsRevenue += (Number(li.unit_price) || 0) * (Number(li.quantity) || 0);
    }
    for (const lab of (addon.labor_items || [])) {
      laborRevenue += Number(lab.price) || 0;
    }
    for (const m of (addon.machining_items || [])) {
      machiningRevenue += (Number(m.price) || 0) * (Number(m.quantity) || 1);
    }
  }

  // Approved additional work (quoted scope additions)
  let awPartsRevenue = 0;
  let awLaborRevenue = 0;
  let awMachiningRevenue = 0;
  let awPartsCost = 0;
  for (const aw of additionalWorks) {
    if (aw.status !== "approved") continue;
    for (const li of (aw.line_items || [])) {
      awPartsRevenue += (Number(li.unit_price) || 0) * (Number(li.quantity) || 0);
      awPartsCost += (Number(li.unit_cost) || 0) * (Number(li.quantity) || 0);
    }
    for (const lab of (aw.labor_items || [])) {
      awLaborRevenue += Number(lab.price) || 0;
    }
    for (const m of (aw.machining_items || [])) {
      awMachiningRevenue += (Number(m.price) || 0) * (Number(m.quantity) || 1);
    }
    for (const os of (aw.outsourced_services || [])) {
      awMachiningRevenue += Number(os.price) || 0;
    }
  }

  const grossRevenue = roundMoney(partsRevenue + laborRevenue + machiningRevenue + awPartsRevenue + awLaborRevenue + awMachiningRevenue);
  const discount = roundMoney(Number(estimate.discount_amount) || 0);
  const revenueBeforeTax = roundMoney(grossRevenue - discount);

  // Quoted cost = parts cost (estimate) + additional work parts cost
  // Labor and machining are 100% margin (per user preference) so quoted cost = parts only
  const totalCost = roundMoney(partsCost + awPartsCost);

  return {
    revenueBeforeTax,
    partsCost: roundMoney(partsCost + awPartsCost),
    partsRevenue: roundMoney(partsRevenue + awPartsRevenue),
    laborRevenue: roundMoney(laborRevenue + awLaborRevenue),
    machiningRevenue: roundMoney(machiningRevenue + awMachiningRevenue),
    discount,
    totalCost,
    hasEstimate: true,
  };
}

// --- Actual computation (from invoices, consumed reservations, tasks, build) ---

function computeActual(invoices, reservations, tasks, build, laborRate, overheadRate) {
  // Actual revenue from invoices (before tax)
  let partsRevenue = 0;
  let laborRevenue = 0;
  let machiningRevenue = 0;
  let discount = 0;
  let taxCollected = 0;
  let creditsApplied = 0;
  let paymentsReceived = 0;

  // Collect machining items across all invoices for cost-type analysis
  const machiningItems = [];

  for (const inv of invoices) {
    if (inv.status === "void") continue;
    for (const li of (inv.line_items || [])) {
      if (li.is_core_credit) continue;
      partsRevenue += (Number(li.unit_price) || 0) * (Number(li.quantity) || 0);
    }
    for (const lab of (inv.labor_items || [])) {
      laborRevenue += Number(lab.price) || 0;
    }
    for (const m of (inv.machining_items || [])) {
      machiningRevenue += (Number(m.price) || 0) * (Number(m.quantity) || 1);
      machiningItems.push(m);
    }
    discount += Number(inv.discount_amount) || 0;
    taxCollected += Number(inv.tax_amount) || 0;
    creditsApplied += Number(inv.applied_credits) || 0;
    paymentsReceived += Number(inv.amount_paid) || 0;
  }

  const grossRevenue = roundMoney(partsRevenue + laborRevenue + machiningRevenue);
  const revenueBeforeTax = roundMoney(grossRevenue - discount);

  // Actual parts cost from CONSUMED reservations (uses cost snapshot)
  let partsCost = 0;
  const missingCosts = [];
  for (const r of reservations) {
    if (r.status !== "consumed") continue;
    const consumed = Number(r.quantity_consumed) || 0;
    if (consumed <= 0) continue;
    const unitCost = r.unit_cost_snapshot != null ? Number(r.unit_cost_snapshot) : null;
    const shipCost = Number(r.shipping_cost_snapshot) || 0;
    if (unitCost == null) {
      missingCosts.push({
        type: "parts_cost",
        part_id: r.part_id,
        part_name: r.part_name || "Unknown part",
        message: `Consumed ${consumed} units of "${r.part_name || r.part_id}" with no cost snapshot — actual parts cost is unknown.`,
      });
      // Do NOT treat as zero — exclude from sum (flagged)
    } else {
      partsCost += (unitCost + shipCost) * consumed;
    }
  }
  partsCost = roundMoney(partsCost);

  // Actual labor hours from tasks (all tasks — in-house machining hours are
  // included here because in-house machining is done by shop labor; the cost
  // is the labor rate + overhead, not a separate vendor cost)
  let laborMinutes = 0;
  for (const t of tasks) {
    const mins = Number(t.time_logged_minutes) || 0;
    if (mins > 0) laborMinutes += mins;
  }
  const laborHours = roundMoney(laborMinutes / 60);

  // Internal labor cost = hours * laborRate.
  // An intentional $0 rate is valid (owner draws) — labor cost is $0, not missing.
  const internalLaborCost = roundMoney(laborHours * laborRate);

  // Overhead cost = hours * overheadRate.
  // Always applied, even when laborRate is $0 — the burden applies to all logged hours.
  const overheadCost = roundMoney(laborHours * overheadRate);

  // Machining cost tracking by cost_type per invoice machining item.
  let outsourcedMachiningCost = 0;
  let inHouseMachiningCount = 0;
  let outsourcedMachiningCount = 0;

  for (const m of machiningItems) {
    const costType = m.cost_type || "unspecified";
    if (costType === "in_house") {
      // Cost is covered by logged labor hours — no separate vendor cost, no warning.
      inHouseMachiningCount++;
    } else if (costType === "outsourced") {
      outsourcedMachiningCount++;
      // actual_cost: null/undefined = missing (flagged); 0 = explicit $0 (valid, not flagged)
      if (m.actual_cost == null) {
        missingCosts.push({
          type: "machining_cost",
          message: `Outsourced machining "${m.name || "(unnamed)"}" has no recorded vendor cost — actual machining cost is unknown. Enter the vendor cost on the invoice.`,
        });
      } else {
        outsourcedMachiningCost += Number(m.actual_cost) || 0;
      }
    } else {
      // unspecified — must be classified before cost can be determined
      missingCosts.push({
        type: "machining_cost",
        message: `Machining "${m.name || "(unnamed)"}" is not marked as in-house or outsourced — actual cost cannot be determined. Mark it on the invoice.`,
      });
    }
  }
  outsourcedMachiningCost = roundMoney(outsourcedMachiningCost);

  // Warranty cost from build
  let warrantyCost = 0;
  if (build?.is_warranty && build.warranty_repair_cost) {
    warrantyCost = roundMoney(Number(build.warranty_repair_cost) || 0);
  }

  const totalCost = roundMoney(
    partsCost + internalLaborCost + overheadCost + outsourcedMachiningCost + warrantyCost
  );

  return {
    revenueBeforeTax,
    partsCost,
    partsRevenue,
    laborRevenue,
    machiningRevenue,
    discount,
    laborHours,
    internalLaborCost,
    overheadCost,
    laborRate,
    overheadRate,
    outsourcedMachiningCost,
    inHouseMachiningCount,
    outsourcedMachiningCount,
    warrantyCost,
    totalCost,
    taxCollected: roundMoney(taxCollected),
    creditsApplied: roundMoney(creditsApplied),
    paymentsReceived: roundMoney(paymentsReceived),
    missingCosts,
  };
}

function buildWarnings(missingCosts) {
  const warnings = [];
  if (missingCosts.length > 0) {
    warnings.push(`${missingCosts.length} missing cost(s) flagged — actual margin may be understated.`);
  }
  return warnings;
}