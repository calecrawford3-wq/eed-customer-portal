/**
 * Item-type normalization for line items on estimates and invoices.
 *
 * Replacing a kit, core sale, core credit, or regular part on the document
 * must clear incompatible flags and references from the previous item so the
 * new item is not misclassified or misprocessed by downstream business rules
 * (PO generation, inventory reservation, core processing, profitability).
 *
 * normalizeLineItem(prev, next) returns a single line-item object with:
 *  - incompatible flags/references cleared (is_kit, kit_id, kit_components,
 *    is_core_credit, core_id, core_details) as applicable;
 *  - the correct inventory association, quantity, cost, price, and total;
 *  - shared context preserved where appropriate (engine_section, tax_class);
 *  - stable invoice-line identity preserved where appropriate (uid on
 *    machining items, engine_section on combined invoices);
 *  - NO carryover of an unrelated source or machining-task association onto a
 *    replacement item — those relationships are reconciled explicitly through
 *    existing business rules (syncMachiningTaskBilling, etc.).
 *
 * Used by both the mobile editor (MobileItemEditor) and the desktop catalog
 * replacement handlers (selectPart / selectKit / selectCore) so the rules are
 * identical everywhere.
 */

const PART_ONLY_FIELDS = [
  "part_id",
  "part_number",
  "item_name",
  "quantity",
  "unit_cost",
  "shipping_cost",
  "unit_price",
  "total",
];

/**
 * Strip every type-specific flag and reference so the next item starts clean.
 * Shared context (engine_section, tax_class, uid) is preserved by the caller.
 */
function stripTypeFields(item) {
  const { is_kit, kit_id, kit_components, is_core_credit, core_id, core_details, ...rest } = item || {};
  return rest;
}

/**
 * Build a normalized line item from a previous item and a candidate next item.
 *
 * @param {object|null} prev  — the line item being replaced (may be null/empty)
 * @param {object}      next — the candidate next item (from the catalog picker)
 * @returns {object}          — a single normalized line item
 */
export function normalizeLineItem(prev, next) {
  const clean = stripTypeFields(prev);
  const engineSection = prev?.engine_section || next?.engine_section || "";
  const taxClass = prev?.tax_class || next?.tax_class || "";
  const uid = next?.uid || prev?.uid || "";

  // Start from the stripped previous item so unrelated source/machining-task
  // associations (source_type, source_id, charge_key, task_ids, etc.) are NOT
  // carried onto the replacement. The candidate `next` provides the new values.
  const base = { ...clean, ...next };

  // Preserve shared context that is independent of item type.
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
 * Clears kit/core flags and references; sets inventory association, qty, cost,
 * price, and total. Preserves engine_section.
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
 * Clears core flags/references; sets is_kit, kit_id, kit_components, qty=1,
 * cost, price, and total. Preserves engine_section.
 */
export function normalizeKit(prev, kit, kitCost, kitPrice) {
  const next = {
    // A kit line is identified by kit_id, not part_id. Clear any stale part_id
    // from the previous item so the kit is not misclassified as a regular part
    // by downstream reservation / PO / profitability logic.
    part_id: "",
    is_kit: true,
    kit_id: kit.id || "",
    part_number: kit.part_number || "",
    item_name: kit.name || "",
    quantity: 1,
    unit_cost: kitCost,
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
 * Clears kit flags/references; sets core_id, part_number, qty=1, cost, price,
 * and total. Preserves engine_section. Does NOT set is_core_credit.
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
    unit_price: price,
    total: price,
  };
  return normalizeLineItem(prev, next);
}

/**
 * Normalize a core credit selection.
 * Clears kit flags/references; sets is_core_credit, core_id, core_details,
 * qty=1, unit_cost=0, unit_price=-credit, total=-credit. Preserves engine_section.
 */
export function normalizeCoreCredit(prev, core) {
  const credit = Number(core.core_credit) || 0;
  const next = {
    part_id: "",
    part_number: core.core_number || "",
    item_name: `Core Credit: ${core.name || ""}`,
    quantity: 1,
    unit_cost: 0,
    unit_price: -credit,
    total: -credit,
    is_core_credit: true,
    core_id: core.id || "",
    core_details: { ...core },
  };
  return normalizeLineItem(prev, next);
}

export { PART_ONLY_FIELDS };