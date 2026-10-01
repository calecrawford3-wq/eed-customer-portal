// Shared inventory reservation logic for engine-build jobs.
//
// Lifecycle:
//   1. Estimate approved (is_engine_build) -> reservePartsForEstimate()
//      Reserves available parts WITHOUT reducing quantity_on_hand. Flags shortages.
//   2. Build created from approved estimate -> linkReservationsToBuild()
//      Sets build_id on the estimate's reservations.
//   3. PO received -> allocateReceiptToShortages() (partial receipts, queue order)
//   4. Build completed -> consumeReservationsForBuild()
//      Deducts quantity_on_hand by quantity_reserved (once), marks consumed.
//   5. Approval withdrawn / job canceled -> releaseReservations()
//
// Idempotency: every operation carries an operation_id. Re-running with the same
// operation_id is a safe no-op (or a reconcile for changed demand). This protects
// against repeated workflow events, double-clicks, and Stripe retries.
//
// All functions receive a base44 service-role client (base44.asServiceRole).

export { aggregateDemand, reservePartsForEstimate, releaseReservations,
         consumeReservationsForBuild, linkReservationsToBuild,
         getPartAvailability, chicagoTodayDate, roundQty };

// --- Helpers ---

function roundQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 1000) / 1000;
}

// Current calendar date in America/Chicago as YYYY-MM-DD.
function chicagoTodayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

// Sum active (non-released, non-consumed) reserved quantities for a part across
// all jobs EXCEPT the given estimate_id (so a job's own reservation isn't double-counted
// when reconciling its own demand).
async function sumReservedForPart(base44, partId, excludeEstimateId) {
  const res = await base44.entities.PartReservation.filter({
    part_id: partId,
    status: { $in: ["reserved", "partially_consumed"] },
  });
  let total = 0;
  for (const r of (res.items || res || [])) {
    if (excludeEstimateId && r.estimate_id === excludeEstimateId) continue;
    total += Number(r.quantity_reserved) || 0;
  }
  return roundQty(total);
}

// --- Demand aggregation ---

/**
 * Aggregate part demand from an estimate's line items, expanding kit components
 * and selected addon parts. Cores (core credit lines) are excluded — they are
 * tracked on EngineCore, not Part inventory.
 *
 * @param {object} estimate
 * @returns {Map<string, {part_id, part_number?, name?, quantity}>} keyed by part_id
 */
function aggregateDemand(estimate) {
  const demand = new Map();

  const add = (partId, qty, partNumber, name) => {
    if (!partId) return;
    const q = roundQty(qty);
    if (q <= 0) return;
    const existing = demand.get(partId);
    if (existing) {
      existing.quantity = roundQty(existing.quantity + q);
    } else {
      demand.set(partId, { part_id: partId, part_number: partNumber || "", name: name || "", quantity: q });
    }
  };

  // 1. Line items — expand kits into their components
  for (const li of (estimate.line_items || [])) {
    if (li.is_core_credit) continue; // cores handled separately
    if (li.is_kit && Array.isArray(li.kit_components) && li.kit_components.length > 0) {
      for (const comp of li.kit_components) {
        add(comp.part_id, (Number(comp.quantity) || 1) * (Number(li.quantity) || 1), comp.part_number, comp.name);
      }
    } else {
      add(li.part_id, li.quantity, li.part_number, li.item_name);
    }
  }

  // 2. Selected addons (preselected by admin OR customer_selected) — expand their line items
  for (const addon of (estimate.addons || [])) {
    if (!["preselected", "customer_selected"].includes(addon.selection_state)) continue;
    for (const li of (addon.line_items || [])) {
      add(li.part_id, li.quantity, li.part_number, li.item_name);
    }
  }

  return demand;
}

// --- Reserve ---

/**
 * Reserve available parts for an engine-build estimate WITHOUT reducing
 * quantity_on_hand. Idempotent via operation_id; reconciles changed demand.
 *
 * @param {object} base44 - service-role client
 * @param {{estimate: object, operation_id: string}} args
 * @returns {Promise<{reserved: Array, shortages: Array, released: Array, operation_id: string}>}
 */
async function reservePartsForEstimate(base44, { estimate, operation_id }) {
  if (!estimate || !estimate.id) throw new Error("estimate required");
  if (!estimate.is_engine_build) return { reserved: [], shortages: [], released: [], operation_id, skipped: true };

  const estimateId = estimate.id;
  const demand = aggregateDemand(estimate);

  // Load existing active reservations for this estimate (to reconcile / detect re-run)
  const existingRes = await base44.entities.PartReservation.filter({
    estimate_id: estimateId,
    status: { $in: ["reserved", "partially_consumed"] },
  });
  const existingByPart = new Map();
  for (const r of (existingRes.items || existingRes || [])) {
    existingByPart.set(r.part_id, r);
  }

  const reserved = [];
  const shortages = [];

  // Process every part in current demand
  for (const [partId, d] of demand) {
    // Fetch the part to get on_hand and display info
    const parts = await base44.entities.Part.filter({ id: partId });
    const part = (parts.items || parts || [])[0];
    const onHand = part ? roundQty(part.quantity_on_hand) : 0;

    // Reserved by OTHER jobs (exclude this estimate)
    const reservedByOthers = await sumReservedForPart(base44, partId, estimateId);
    const available = roundQty(onHand - reservedByOthers);

    const existing = existingByPart.get(partId);
    const requiredQty = d.quantity;

    if (existing) {
      // Reconcile: adjust reserved/short to match current demand
      const newReserved = roundQty(Math.min(requiredQty, available));
      const newShort = roundQty(Math.max(0, requiredQty - available));
      const changed =
        existing.quantity_required !== requiredQty ||
        existing.quantity_reserved !== newReserved ||
        existing.quantity_short !== newShort;
      if (changed) {
        await base44.entities.PartReservation.update(existing.id, {
          quantity_required: requiredQty,
          quantity_reserved: newReserved,
          quantity_short: newShort,
          part_number: d.part_number || existing.part_number,
          part_name: d.name || existing.part_name,
          operation_id,
        });
      }
      existingByPart.delete(partId);
      reserved.push({ part_id: partId, name: d.name, required: requiredQty, reserved: newReserved, short: newShort, on_hand: onHand });
      if (newShort > 0) shortages.push({ part_id: partId, name: d.name, short: newShort, on_hand: onHand });
    } else {
      const newReserved = roundQty(Math.min(requiredQty, available));
      const newShort = roundQty(Math.max(0, requiredQty - available));
      await base44.entities.PartReservation.create({
        estimate_id: estimateId,
        build_id: estimate.build_id || "",
        part_id: partId,
        part_number: d.part_number || (part ? part.part_number : ""),
        part_name: d.name || (part ? part.name : ""),
        quantity_required: requiredQty,
        quantity_reserved: newReserved,
        quantity_short: newShort,
        quantity_consumed: 0,
        status: "reserved",
        operation_id,
      });
      reserved.push({ part_id: partId, name: d.name, required: requiredQty, reserved: newReserved, short: newShort, on_hand: onHand });
      if (newShort > 0) shortages.push({ part_id: partId, name: d.name, short: newShort, on_hand: onHand });
    }
  }

  // Release reservations for parts no longer in demand (estimate edited to remove a part)
  const released = [];
  for (const [, r] of existingByPart) {
    if (r.status === "consumed") continue; // preserve consumed history
    await base44.entities.PartReservation.update(r.id, {
      status: "released",
      released_at: new Date().toISOString(),
      released_reason: "Part removed from approved estimate",
      operation_id,
    });
    released.push({ part_id: r.part_id, name: r.part_name, released: r.quantity_reserved });
  }

  return { reserved, shortages, released, operation_id };
}

// --- Release ---

/**
 * Release all active reservations for an estimate (approval withdrawn or job canceled).
 * Consumed reservations are preserved (completion history).
 *
 * @param {object} base44
 * @param {{estimate_id: string, reason: string, operation_id: string}} args
 */
async function releaseReservations(base44, { estimate_id, reason, operation_id }) {
  const res = await base44.entities.PartReservation.filter({
    estimate_id,
    status: { $in: ["reserved", "partially_consumed"] },
  });
  let count = 0;
  for (const r of (res.items || res || [])) {
    await base44.entities.PartReservation.update(r.id, {
      status: "released",
      released_at: new Date().toISOString(),
      released_reason: reason,
      operation_id,
    });
    count++;
  }
  return { released: count, operation_id };
}

// --- Link reservations to build ---

/**
 * Set build_id on an estimate's reservations once the engine build is created.
 * Idempotent — safe to call repeatedly.
 *
 * @param {object} base44
 * @param {{estimate_id: string, build_id: string, operation_id: string}} args
 */
async function linkReservationsToBuild(base44, { estimate_id, build_id, operation_id }) {
  const res = await base44.entities.PartReservation.filter({ estimate_id });
  let count = 0;
  for (const r of (res.items || res || [])) {
    if (r.build_id === build_id) continue;
    await base44.entities.PartReservation.update(r.id, { build_id, operation_id });
    count++;
  }
  return { linked: count, operation_id };
}

// --- Consume (completion) ---

/**
 * Consume reservations for a build at completion: deduct quantity_on_hand by
 * quantity_reserved (the actually-reserved units, NOT short units) exactly once,
 * and mark reservations consumed. Idempotent via operation_id — a re-run is a no-op.
 *
 * Returns the list of parts deducted and any remaining shortages that block completion.
 *
 * @param {object} base44
 * @param {{build_id: string, operation_id: string, allowShortageOverride?: boolean}} args
 * @returns {Promise<{deducted: Array, shortages: Array, already_consumed: boolean, operation_id: string}>}
 */
async function consumeReservationsForBuild(base44, { build_id, operation_id, allowShortageOverride }) {
  // Find reservations for this build (by build_id, or via estimate if build_id not yet set)
  let res = await base44.entities.PartReservation.filter({ build_id, status: { $in: ["reserved", "partially_consumed"] } });
  let reservations = res.items || res || [];

  // If none found by build_id, try via the estimate linked to this build
  if (reservations.length === 0) {
    const estimates = await base44.entities.Estimate.filter({ build_id });
    const estimate = (estimates.items || estimates || [])[0];
    if (estimate) {
      res = await base44.entities.PartReservation.filter({ estimate_id: estimate.id, status: { $in: ["reserved", "partially_consumed"] } });
      reservations = res.items || res || [];
      // Link them to the build now
      for (const r of reservations) {
        if (!r.build_id) await base44.entities.PartReservation.update(r.id, { build_id, operation_id });
      }
    }
  }

  // Idempotency: if all matching reservations are already consumed, this is a re-run
  const allRes = await base44.entities.PartReservation.filter({ build_id });
  const anyConsumed = (allRes.items || allRes || []).some(r => r.status === "consumed");
  if (anyConsumed && reservations.length === 0) {
    return { deducted: [], shortages: [], already_consumed: true, operation_id };
  }

  // Check for unresolved shortages before deducting
  const shortages = [];
  for (const r of reservations) {
    if ((Number(r.quantity_short) || 0) > 0) {
      shortages.push({ part_id: r.part_id, name: r.part_name, short: r.quantity_short });
    }
  }
  if (shortages.length > 0 && !allowShortageOverride) {
    return { deducted: [], shortages, already_consumed: false, operation_id, blocked: true };
  }

  // Deduct quantity_on_hand by quantity_reserved, once per part
  const deducted = [];
  for (const r of reservations) {
    const consumeQty = roundQty(r.quantity_reserved);
    if (consumeQty <= 0) continue;
    const parts = await base44.entities.Part.filter({ id: r.part_id });
    const part = (parts.items || parts || [])[0];
    if (!part) {
      deducted.push({ part_id: r.part_id, name: r.part_name, deducted: 0, error: "part not found" });
      continue;
    }
    const current = roundQty(part.quantity_on_hand);
    const newQty = roundQty(Math.max(0, current - consumeQty));
    await base44.entities.Part.update(part.id, { quantity_on_hand: newQty });
    await base44.entities.PartReservation.update(r.id, {
      quantity_consumed: consumeQty,
      status: "consumed",
      consumed_at: new Date().toISOString(),
      operation_id,
    });
    deducted.push({ part_id: part.id, name: r.part_name, from: current, to: newQty, deducted: consumeQty });
  }

  return { deducted, shortages, already_consumed: false, operation_id };
}

// --- Availability ---

/**
 * Compute on-hand / reserved / available for a single part.
 * @param {object} base44
 * @param {string} partId
 * @returns {Promise<{on_hand: number, reserved: number, available: number}>}
 */
async function getPartAvailability(base44, partId) {
  const parts = await base44.entities.Part.filter({ id: partId });
  const part = (parts.items || parts || [])[0];
  const onHand = part ? roundQty(part.quantity_on_hand) : 0;
  const reserved = await sumReservedForPart(base44, partId, null);
  return { on_hand: onHand, reserved: roundQty(reserved), available: roundQty(onHand - reserved) };
}