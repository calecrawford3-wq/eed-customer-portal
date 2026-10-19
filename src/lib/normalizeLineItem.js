/**
 * Item-type normalization for line items on estimates and invoices.
 *
 * Replacing a kit, core sale, core credit, or regular part on the document
 * must clear incompatible flags and references from the previous item so the
 * new item is not misclassified or misprocessed by downstream business rules
 * (PO generation, inventory reservation, core processing, profitability).
 *
 * Three categories of fields are handled:
 *
 * 1. Stable document-line identity and shared context — PRESERVED across
 *    replacement: engine_section (combined-invoice attribution), tax_class
 *    (Oklahoma sales tax), uid (machining-charge link key).
 *
 * 2. Product-specific fields — REPLACED entirely from the catalog selection:
 *    part_id, part_number, item_name, quantity, unit_cost, shipping_cost,
 *    unit_price, total, is_kit, kit_id, kit_components, is_core_credit,
 *    core_id, core_details. The previous item's values are never carried over.
 *
 * 3. Business relationships — NOT carried onto an unrelated replacement:
 *    source_type, source_id, charge_key, task_ids, finding_id,
 *    additional_work_id, invoice_id, billing_status, expense_id, vendor,
 *    cost_type, actual_cost. These belong to the old product; the replacement
 *    is a different product, so the old links are stale. Reconciliation happens
 *    through existing business rules (syncMachiningTaskBilling, etc.) which
 *    detect the old charge is gone and recompute the task's billing status —
 *    no relationships are blindly deleted and no duplicate charges are created.
 *
 * normalizeLineItem(prev, next) builds the result from `next` plus the preserved
 * shared context only — it never spreads the previous item, so no stale
 * product-specific fields or business relationships can leak through.
 *
 * Used by both the mobile editor (MobileItemEditor) and the desktop catalog
 * replacement handlers (selectPart / selectKit / selectCore) so the rules are
 * identical everywhere.
 */

/**
 * Build a normalized line item from a previous item and a candidate next item.
 *
 * @param {object|null} prev  — the line item being replaced (may be null/empty)
 * @param {object}      next — the candidate next item (from the catalog picker)
 * @returns {object}          — a single normalized line item
 */
export function normalizeLineItem(prev, next) {
  // Preserve stable document-line identity and shared context that are
  // independent of the selected product.
  const engineSection = prev?.engine_section || next?.engine_section || "";
  const taxClass = prev?.tax_class || next?.tax_class || "";
  const uid = next?.uid || prev?.uid || "";

  // Build the replacement from the candidate `next` only. We deliberately do
  // NOT spread the previous item, so stale product-specific fields and business
  // relationships (source_type, source_id, charge_key, task_ids, ...) from the
  // old product cannot carry onto the unrelated replacement.
  const base = { ...next };

  if (engineSection) base.engine_section = engineSection;
  else delete base.engine_section;
  if (taxClass) base.tax_class = taxClass;
  if (uid) base.uid = uid;

  // Ensure required numeric fields exist and total is computed.
  const qty = Number(base.quantity) || (next?.quantity ?? 1);
  const price = Number(base.unit_price) || 0;
  base.quantity = qty;
  base.unit_price = price;
  base.total = qty * price;

  return base;
}

/**
 * Normalize a regular part selection.
 * Sets inventory association, qty, cost, per-unit shipping, price, and total.
 * Clears kit/core flags and all business relationships from the previous item.
 * Preserves engine_section and tax_class.
 */
export function normalizePart(prev, part, priceOverride) {
  const price = (priceOverride ?? Number(part.sell_price)) || 0;
  const next = {
    part_id: part.id || "",
    part_number: part.part_number || "",
    item_name: part.name || "",
    quantity: Number(prev?.quantity) || 1,
    unit_cost: Number(part.unit_cost) || 0,
    shipping_cost: Number(part.shipping_cost) || 0,
    unit_price: price,
    total: (Number(prev?.quantity) || 1) * price,
  };
  return normalizeLineItem(prev, next);
}

/**
 * Normalize a kit selection (whole kit as a single line).
 * Sets is_kit, kit_id, kit_components, qty=1, cost, price, and total.
 * A kit line is identified by kit_id, not part_id. Per-unit inbound shipping
 * is zero (kit shipping is handled at the kit level, not per component).
 * Clears core flags and all business relationships from the previous item.
 * Preserves engine_section and tax_class.
 */
export function normalizeKit(prev, kit, kitCost, kitPrice) {
  const next = {
    part_id: "",
    is_kit: true,
    kit_id: kit.id || "",
    part_number: kit.part_number || "",
    item_name: kit.name || "",
    quantity: 1,
    unit_cost: kitCost,
    shipping_cost: 0,
    unit_price: kitPrice,
    total: kitPrice,
    kit_components: (kit.components || []).map((c) => ({
      part_id: c.part_id || "",
      part_number: c.part_number || "",
      name: c.name || "",
      quantity: Number(c.quantity) || 1,
      unit_cost: Number(c.unit_cost) || 0,
    })),
  };
  return normalizeLineItem(prev, next);
}

/**
 * Normalize a core sale selection.
 * Sets core_id, part_number, qty=1, cost, price, and total. Does NOT set
 * is_core_credit. Per-unit inbound shipping is zero (core shipping is handled
 * separately from per-item internal shipping costs).
 * Clears kit flags and all business relationships from the previous item.
 * Preserves engine_section and tax_class.
 */
export function normalizeCoreSale(prev, core) {
  const price = Number(core.sell_price) || 0;
  const next = {
    part_id: "",
    part_number: core.core_number || "",
    core_id: core.id || "",
    item_name: `${core.name || ""} (Core)`,
    quantity: 1,
    unit_cost: Number(core.unit_cost) || 0,
    shipping_cost: 0,
    unit_price: price,
    total: price,
  };
  return normalizeLineItem(prev, next);
}

/**
 * Normalize a core credit selection.
 * Sets is_core_credit, core_id, core_details, qty=1, unit_cost=0,
 * unit_price=-credit, total=-credit. Per-unit inbound shipping is zero.
 * Clears kit flags and all business relationships from the previous item.
 * Preserves engine_section and tax_class.
 */
export function normalizeCoreCredit(prev, core) {
  const credit = Number(core.core_credit) || 0;
  const next = {
    part_id: "",
    part_number: core.core_number || "",
    item_name: `Core Credit: ${core.name || ""}`,
    quantity: 1,
    unit_cost: 0,
    shipping_cost: 0,
    unit_price: -credit,
    total: -credit,
    is_core_credit: true,
    core_id: core.id || "",
    core_details: { ...core },
  };
  return normalizeLineItem(prev, next);
}