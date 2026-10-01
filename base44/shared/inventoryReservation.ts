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
// Concurrency: all availability-checking operations (reserve, consume, allocate,
// release) are serialized per-part via an optimistic mutex stored on
// Part.reservation_lock. This prevents two simultaneous jobs from reserving the
// same physical stock — the combined active reservations never exceed on-hand.
//
// Retry safety: consumption re-reads each reservation inside the lock before
// deducting, so a retry after a partial failure (stock deducted but reservation
// update failed) does NOT double-deduct. The reservation's status is the source
// of truth — a "consumed" reservation is always skipped.
//
// All functions receive a base44 service-role client (base44.asServiceRole).

export { aggregateDemand, reservePartsForEstimate, releaseReservations,
         consumeReservationsForBuild, linkReservationsToBuild,
         allocateReceiptToShortages, recomputeJobPartsReadiness,
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

const LOCK_STALE_MS = 30000; // locks older than 30s are considered stale

/**
 * Acquire a per-part mutex lock, run fn(), then release. Serializes all
 * availability-checking operations on a given part so two concurrent jobs
 * cannot reserve the same physical stock.
 *
 * Lock value: "<timestamp>_<random>" — the timestamp prefix enables stale-lock
 * cleanup via lexicographic $lt comparison (all Date.now() values are 13 digits).
 *
 * If the Part doesn't exist, the lock is skipped and fn() runs unlocked (the
 * part has 0 on-hand so the reservation will be all-short — no over-reservation
 * possible).
 */
async function withPartLock(base44, partId, operationId, fn) {
  const lockTs = Date.now();
  const lockValue = `${lockTs}_${Math.random().toString(36).slice(2, 8)}`;
  let acquired = false;

  for (let attempt = 0; attempt < 20; attempt++) {
    const staleCutoff = String(lockTs - LOCK_STALE_MS);
    // Try to acquire: set lock if empty, missing, or stale
    await base44.entities.Part.updateMany(
      {
        id: partId,
        $or: [
          { reservation_lock: "" },
          { reservation_lock: { $exists: false } },
          { reservation_lock: { $lt: staleCutoff } },
        ],
      },
      { $set: { reservation_lock: lockValue } }
    );

    // Verify we acquired it by reading back
    const parts = await base44.entities.Part.filter({ id: partId });
    const part = (parts.items || parts || [])[0];
    if (!part) {
      // Part doesn't exist — skip locking, just run fn()
      return await fn();
    }
    if (part.reservation_lock === lockValue) {
      acquired = true;
      break;
    }
    // Someone else holds the lock — wait with jitter
    await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150));
  }

  if (!acquired) {
    throw new Error(`Could not acquire reservation lock for part ${partId} after 20 attempts`);
  }

  try {
    return await fn();
  } finally {
    // Release lock (only if it's still ours)
    await base44.entities.Part.updateMany(
      { id: partId, reservation_lock: lockValue },
      { $set: { reservation_lock: "" } }
    );
  }
}

// Sum active (non-released, non-consumed) reserved quantities for a part across
// all jobs EXCEPT the given estimate_id (so a job's own reservation isn't
// double-counted when reconciling its own demand).
async function sumReservedForPart(base44, partId, excludeEstimateId) {
  const res = await base44.entities.PartReservation.filter({
    part_id: partId,
    status: { $in: ["reserved", "partially_consumed"] },
  });
  let total = 0;
  for (const r of res.items || res || []) {
    if (excludeEstimateId && r.estimate_id === excludeEstimateId) continue;
    total += Number(r.quantity_reserved) || 0;
  }
  return roundQty(total);
}

// --- Demand aggregation ---

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

  for (const li of estimate.line_items || []) {
    if (li.is_core_credit) continue;
    if (li.is_kit && Array.isArray(li.kit_components) && li.kit_components.length > 0) {
      for (const comp of li.kit_components) {
        add(comp.part_id, (Number(comp.quantity) || 1) * (Number(li.quantity) || 1), comp.part_number, comp.name);
      }
    } else {
      add(li.part_id, li.quantity, li.part_number, li.item_name);
    }
  }

  for (const addon of estimate.addons || []) {
    if (!["preselected", "customer_selected"].includes(addon.selection_state)) continue;
    for (const li of addon.line_items || []) {
      add(li.part_id, li.quantity, li.part_number, li.item_name);
    }
  }

  return demand;
}

// --- Reserve ---

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
  for (const r of existingRes.items || existingRes || []) {
    existingByPart.set(r.part_id, r);
  }

  const reserved = [];
  const shortages = [];

  // Process every part in current demand — each part is locked so two concurrent
  // reservations for the same part cannot both see the same available stock.
  for (const [partId, d] of demand) {
    const requiredQty = d.quantity;
    const existing = existingByPart.get(partId);

    const result = await withPartLock(base44, partId, operation_id, async () => {
      const parts = await base44.entities.Part.filter({ id: partId });
      const part = (parts.items || parts || [])[0];
      const onHand = part ? roundQty(part.quantity_on_hand) : 0;

      // Reserved by OTHER jobs (exclude this estimate) — safe to read inside the lock
      const reservedByOthers = await sumReservedForPart(base44, partId, estimateId);
      const available = roundQty(onHand - reservedByOthers);

      const newReserved = roundQty(Math.min(requiredQty, available));
      const newShort = roundQty(Math.max(0, requiredQty - available));

      if (existing) {
        // Reconcile: adjust reserved/short to match current demand
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
      } else {
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
      }

      return { newReserved, newShort, onHand };
    });

    existingByPart.delete(partId);
    reserved.push({ part_id: partId, name: d.name, required: requiredQty, reserved: result.newReserved, short: result.newShort, on_hand: result.onHand });
    if (result.newShort > 0) shortages.push({ part_id: partId, name: d.name, short: result.newShort, on_hand: result.onHand });
  }

  // Release reservations for parts no longer in demand (estimate edited to remove a part)
  const released = [];
  for (const [, r] of existingByPart) {
    if (r.status === "consumed") continue; // preserve consumed history
    await withPartLock(base44, r.part_id, operation_id, async () => {
      // Re-read inside lock — a concurrent consume might have already consumed it
      const rRes = await base44.entities.PartReservation.filter({ id: r.id });
      const rLatest = (rRes.items || rRes || [])[0];
      if (!rLatest || rLatest.status === "consumed" || rLatest.status === "released") return;
      await base44.entities.PartReservation.update(r.id, {
        status: "released",
        released_at: new Date().toISOString(),
        released_reason: "Part removed from approved estimate",
        operation_id,
      });
    });
    released.push({ part_id: r.part_id, name: r.part_name, released: r.quantity_reserved });
  }

  return { reserved, shortages, released, operation_id };
}

// --- Release ---

async function releaseReservations(base44, { estimate_id, reason, operation_id }) {
  const res = await base44.entities.PartReservation.filter({
    estimate_id,
    status: { $in: ["reserved", "partially_consumed"] },
  });
  const reservations = res.items || res || [];

  // Group by part for per-part locking
  const byPart = new Map();
  for (const r of reservations) {
    if (!byPart.has(r.part_id)) byPart.set(r.part_id, []);
    byPart.get(r.part_id).push(r);
  }

  let count = 0;
  for (const [partId, partReservations] of byPart) {
    await withPartLock(base44, partId, operation_id, async () => {
      for (const r of partReservations) {
        // Re-read inside lock — a concurrent consume might have already consumed it
        const rRes = await base44.entities.PartReservation.filter({ id: r.id });
        const rLatest = (rRes.items || rRes || [])[0];
        if (!rLatest || rLatest.status === "consumed" || rLatest.status === "released") continue;
        await base44.entities.PartReservation.update(r.id, {
          status: "released",
          released_at: new Date().toISOString(),
          released_reason: reason,
          operation_id,
        });
        count++;
      }
    });
  }
  return { released: count, operation_id };
}

// --- Link reservations to build ---

async function linkReservationsToBuild(base44, { estimate_id, build_id, operation_id }) {
  const res = await base44.entities.PartReservation.filter({ estimate_id });
  let count = 0;
  for (const r of res.items || res || []) {
    if (r.build_id === build_id) continue;
    await base44.entities.PartReservation.update(r.id, { build_id, operation_id });
    count++;
  }
  return { linked: count, operation_id };
}

// --- Consume (completion) ---

async function consumeReservationsForBuild(base44, { build_id, operation_id, allowShortageOverride }) {
  // Find reservations for this build (by build_id, or via estimate if build_id not yet set)
  let res = await base44.entities.PartReservation.filter({ build_id, status: { $in: ["reserved", "partially_consumed"] } });
  let reservations = res.items || res || [];

  if (reservations.length === 0) {
    const estimates = await base44.entities.Estimate.filter({ build_id });
    const estimate = (estimates.items || estimates || [])[0];
    if (estimate) {
      res = await base44.entities.PartReservation.filter({ estimate_id: estimate.id, status: { $in: ["reserved", "partially_consumed"] } });
      reservations = res.items || res || [];
      for (const r of reservations) {
        if (!r.build_id) await base44.entities.PartReservation.update(r.id, { build_id, operation_id });
      }
    }
  }

  // Idempotency: if all matching reservations are already consumed, this is a re-run
  const allRes = await base44.entities.PartReservation.filter({ build_id });
  const anyConsumed = (allRes.items || allRes || []).some((r) => r.status === "consumed");
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

  // Deduct quantity_on_hand by quantity_reserved, once per part.
  // Each part is locked and each reservation is re-read inside the lock —
  // so a retry after a partial failure (stock deducted but reservation update
  // failed) does NOT double-deduct. The reservation's status is the source of
  // truth: a "consumed" reservation is always skipped.
  const deducted = [];
  for (const r of reservations) {
    const consumeQty = roundQty(r.quantity_reserved);
    if (consumeQty <= 0) continue;

    const result = await withPartLock(base44, r.part_id, operation_id, async () => {
      // Re-read the reservation inside the lock — check if already consumed
      const rRes = await base44.entities.PartReservation.filter({ id: r.id });
      const rLatest = (rRes.items || rRes || [])[0];
      if (!rLatest || rLatest.status === "consumed") {
        return { skipped: true };
      }

      const parts = await base44.entities.Part.filter({ id: r.part_id });
      const part = (parts.items || parts || [])[0];
      if (!part) {
        // Mark consumed even if part is missing (don't block completion)
        await base44.entities.PartReservation.update(r.id, {
          quantity_consumed: consumeQty,
          status: "consumed",
          consumed_at: new Date().toISOString(),
          operation_id,
        });
        return { skipped: false, from: 0, to: 0, deducted: 0, error: "part not found" };
      }

      const current = roundQty(part.quantity_on_hand);
      const newQty = roundQty(Math.max(0, current - consumeQty));
      await base44.entities.Part.update(part.id, { quantity_on_hand: newQty });

      // Capture cost snapshot at consumption time
      const unitCostSnapshot = part.unit_cost != null ? Number(part.unit_cost) : null;
      const shippingCostSnapshot = Number(part.shipping_cost) || 0;
      await base44.entities.PartReservation.update(r.id, {
        quantity_consumed: consumeQty,
        status: "consumed",
        consumed_at: new Date().toISOString(),
        unit_cost_snapshot: unitCostSnapshot,
        shipping_cost_snapshot: shippingCostSnapshot,
        operation_id,
      });

      return { skipped: false, from: current, to: newQty, deducted: consumeQty, unit_cost_snapshot: unitCostSnapshot };
    });

    if (result.skipped) continue;
    deducted.push({
      part_id: r.part_id,
      name: r.part_name,
      from: result.from,
      to: result.to,
      deducted: result.deducted,
      unit_cost_snapshot: result.unit_cost_snapshot,
      error: result.error,
    });
  }

  return { deducted, shortages, already_consumed: false, operation_id };
}

// --- Allocate receipt to shortages ---

async function allocateReceiptToShortages(base44, { part_id, received_qty, operation_id }) {
  const qty = roundQty(received_qty);
  if (qty <= 0) return { allocated: [], unallocated: 0 };

  // Use per-part lock to serialize allocation — two concurrent receipts for the
  // same part cannot both allocate to the same shortage.
  return await withPartLock(base44, part_id, operation_id, async () => {
    const res = await base44.entities.PartReservation.filter({
      part_id,
      quantity_short: { $gt: 0 },
      status: { $in: ["reserved", "partially_consumed"] },
    }, "created_date", 500);
    const reservations = res.items || res || [];

    let remaining = qty;
    const allocated = [];

    for (const r of reservations) {
      if (remaining <= 0) break;
      // Re-read inside lock to get the latest quantity_short
      const rRes = await base44.entities.PartReservation.filter({ id: r.id });
      const rLatest = (rRes.items || rRes || [])[0];
      if (!rLatest || !["reserved", "partially_consumed"].includes(rLatest.status)) continue;
      const currentShort = roundQty(rLatest.quantity_short || 0);
      if (currentShort <= 0) continue;

      const canAllocate = roundQty(Math.min(remaining, currentShort));
      const newShort = roundQty(currentShort - canAllocate);
      const newReserved = roundQty(rLatest.quantity_reserved + canAllocate);
      await base44.entities.PartReservation.update(r.id, {
        quantity_short: newShort,
        quantity_reserved: newReserved,
        operation_id,
      });
      remaining = roundQty(remaining - canAllocate);
      allocated.push({
        reservation_id: r.id,
        estimate_id: r.estimate_id,
        build_id: r.build_id,
        part_id,
        allocated: canAllocate,
        remaining_short: newShort,
      });
    }

    return { allocated, unallocated: remaining };
  });
}

// --- Recompute job parts readiness ---

async function recomputeJobPartsReadiness(base44, jobId, estimateId) {
  if (!jobId || !estimateId) return null;
  const res = await base44.entities.PartReservation.filter({
    estimate_id: estimateId,
    status: { $in: ["reserved", "partially_consumed"] },
  });
  const reservations = res.items || res || [];
  if (reservations.length === 0) {
    await base44.entities.Job.update(jobId, { parts_readiness: "unknown" });
    return "unknown";
  }
  const hasShort = reservations.some((r) => (Number(r.quantity_short) || 0) > 0);
  const readiness = hasShort ? "waiting_on_parts" : "ready";
  await base44.entities.Job.update(jobId, { parts_readiness: readiness });
  return readiness;
}

// --- Availability ---

async function getPartAvailability(base44, partId) {
  const parts = await base44.entities.Part.filter({ id: partId });
  const part = (parts.items || parts || [])[0];
  const onHand = part ? roundQty(part.quantity_on_hand) : 0;
  const reserved = await sumReservedForPart(base44, partId, null);
  return { on_hand: onHand, reserved: roundQty(reserved), available: roundQty(onHand - reserved) };
}