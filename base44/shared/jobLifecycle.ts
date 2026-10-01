// Shared job lifecycle logic: create-or-reconcile a Job from an estimate's state.
//
// A Job is the unified workspace that links an estimate, build, invoice, customer,
// and customer engine. It is created when an estimate is created (draft, not active)
// and activated when the estimate is approved AND the deposit requirement is met
// (or there is no deposit requirement).
//
// reconcileJobFromEstimate is idempotent: it creates the job if missing, then
// re-derives stage/activation/blocking from the current estimate + build + invoice
// state. Safe to call on every estimate create, approve, deposit, and payment event.
//
// All functions receive a base44 service-role client.

export { reconcileJobFromEstimate, deriveStageAndBlocking, generateJobNumber, computePartsReadiness };

// --- Helpers ---

async function maxJobSeq(base44) {
  // Find the highest numeric suffix in job_number to avoid collisions.
  // Use a broad query (filter({}) matches nothing in this SDK) and compute max in JS.
  const res = await base44.entities.Job.filter({ stage: { $in: ["awaiting_approval", "awaiting_deposit", "queued", "teardown", "waiting_on_parts", "machining", "assembly", "testing", "ready_for_pickup", "picked_up"] } });
  const items = res.items || res || [];
  let max = 100000;
  for (const j of items) {
    const m = /JOB-(\d+)/.exec(j.job_number || "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

function generateJobNumber(seq) {
  return `JOB-${seq}`;
}

// Determine deposit-met state from an estimate
function isDepositMet(estimate) {
  if (!estimate.deposit_required) return true;
  if (estimate.deposit_paid) return true;
  // Also treat as met if amount_paid >= deposit_amount
  const paid = Number(estimate.amount_paid) || 0;
  const req = Number(estimate.deposit_amount) || 0;
  return req > 0 && paid >= req;
}

// Derive stage + blocking + is_active from estimate/build state.
// When a manual_stage_override is set on the job, it takes precedence over the
// build-status derivation so admins can place a job in any active stage (e.g.
// "machining", which has no 1:1 build status) and move it backward freely.
function deriveStageAndBlocking(estimate, build, override) {
  const estStatus = estimate?.status || "draft";
  const depositMet = isDepositMet(estimate);

  // Pre-activation
  if (estStatus !== "approved") {
    return { stage: "awaiting_approval", blocking: "awaiting_approval", is_active: false };
  }
  if (estimate.deposit_required && !depositMet) {
    return { stage: "awaiting_deposit", blocking: "awaiting_deposit", is_active: false };
  }

  // Manual override takes precedence for activated jobs. Preserve blocking
  // conditions (e.g. waiting_on_parts) from the build's work_tag so a stage
  // change doesn't clear a valid hold. Terminal stages clear blocking.
  if (override && override !== "awaiting_approval" && override !== "awaiting_deposit") {
    let blocking = "none";
    if (build && override !== "ready_for_pickup" && override !== "picked_up") {
      if (build.work_tag === "waiting_on_parts") blocking = "waiting_on_parts";
      else if (build.work_tag === "on_hold") blocking = "waiting_on_customer";
    }
    return { stage: override, blocking, is_active: true };
  }

  // Activated — derive active stage from build status
  let stage = "queued";
  let blocking = "none";
  if (build) {
    switch (build.status) {
      case "queued": stage = "queued"; break;
      case "in_progress": stage = "teardown"; break;
      case "assembly": stage = "assembly"; break;
      case "testing": stage = "testing"; break;
      case "complete": stage = "ready_for_pickup"; break;
      case "shipped": stage = "picked_up"; break;
      default: stage = "queued";
    }
    if (build.work_tag === "waiting_on_parts") blocking = "waiting_on_parts";
    else if (build.work_tag === "on_hold") blocking = "waiting_on_customer";
  }
  return { stage, blocking, is_active: true };
}

// Compute parts readiness from PartReservation records for a job
async function computePartsReadiness(base44, estimateId, buildId) {
  const query = buildId ? { build_id: buildId } : { estimate_id: estimateId };
  if (!estimateId && !buildId) return "unknown";
  const res = await base44.entities.PartReservation.filter({
    ...query,
    status: { $in: ["reserved", "partially_consumed"] },
  });
  const reservations = res.items || res || [];
  if (reservations.length === 0) return "unknown";
  const hasShortage = reservations.some(r => (Number(r.quantity_short) || 0) > 0);
  if (hasShortage) return "waiting_on_parts";
  return "ready";
}

// --- Core reconcile ---

/**
 * Create-or-reconcile a Job from an estimate. Idempotent.
 *
 * @param {object} base44 - service-role client
 * @param {{ estimate: object, build?: object|null, invoice_id?: string|null, activate?: boolean }} args
 * @returns {Promise<{ job: object, created: boolean, activated: boolean }>}
 */
async function reconcileJobFromEstimate(base44, { estimate, build, invoice_id, activate }) {
  if (!estimate || !estimate.id) throw new Error("estimate required");

  // Find existing job by estimate_id
  let job = null;
  const existing = await base44.entities.Job.filter({ estimate_id: estimate.id });
  job = (existing.items || existing || [])[0] || null;

  const { stage, blocking, is_active } = deriveStageAndBlocking(estimate, build, job?.manual_stage_override);
  const depositMet = isDepositMet(estimate);
  const shouldActivate = is_active && (activate !== false);

  // Resolve linked records
  const buildId = build?.id || estimate.build_id || job?.build_id || "";
  const invoiceIds = job?.invoice_ids || [];
  if (invoice_id && !invoiceIds.includes(invoice_id)) invoiceIds.push(invoice_id);
  if (estimate.invoice_id && !invoiceIds.includes(estimate.invoice_id)) invoiceIds.push(estimate.invoice_id);

  // Compute parts readiness (best-effort — don't fail the whole reconcile)
  let partsReadiness = job?.parts_readiness || "unknown";
  try {
    partsReadiness = await computePartsReadiness(base44, estimate.id, buildId);
  } catch (e) { /* leave existing */ }

  const now = new Date().toISOString();
  const updates = {
    customer_id: estimate.customer_id,
    customer_engine_id: estimate.customer_engine_id || job?.customer_engine_id || "",
    estimate_id: estimate.id,
    build_id: buildId,
    invoice_ids: invoiceIds,
    platform_id: estimate.customer_engine_id ? (build?.platform_id || job?.platform_id || "") : (build?.platform_id || job?.platform_id || ""),
    is_engine_build: estimate.is_engine_build ?? job?.is_engine_build ?? false,
    deposit_required: !!estimate.deposit_required,
    deposit_amount: Number(estimate.deposit_amount) || 0,
    deposit_met: depositMet,
    stage,
    blocking_condition: blocking,
    is_active: shouldActivate,
    parts_readiness: partsReadiness,
    storage_location: build?.storage_location || job?.storage_location || "",
  };

  // Timestamps
  if (estimate.status === "approved" && !job?.approved_at) updates.approved_at = job?.approved_at || now;
  if (depositMet && estimate.deposit_required && !job?.deposit_met_at) updates.deposit_met_at = job?.deposit_met_at || now;
  if (shouldActivate && !job?.activated_at) updates.activated_at = job?.activated_at || now;

  if (!job) {
    const seq = await maxJobSeq(base44);
    const jobNumber = generateJobNumber(seq);
    job = await base44.entities.Job.create({
      job_number: jobNumber,
      ...updates,
      service_package: job?.service_package || "",
    });
    return { job, created: true, activated: shouldActivate };
  }

  // Reconcile existing — only update changed fields
  job = await base44.entities.Job.update(job.id, updates);
  return { job, created: false, activated: shouldActivate && !job?.activated_at };
}