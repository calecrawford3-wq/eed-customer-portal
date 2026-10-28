// Computes the final addon price the same way it is snapshotted when added to an estimate.
export function computeAddonPrice(addon, { parts = [], laborItems = [], machiningItems = [] } = {}) {
  const partsMap = Object.fromEntries(parts.map((p) => [p.id, p]));
  const laborMap = Object.fromEntries(laborItems.map((l) => [l.id, l]));
  const machiningMap = Object.fromEntries(machiningItems.map((m) => [m.id, m]));

  const partsTotal = (addon.line_items || []).reduce((sum, item) => {
    const inv = item.part_id ? partsMap[item.part_id] : null;
    const unitPrice = inv ? Number(inv.sell_price) || 0 : 0;
    const qty = Number(item.quantity) || 1;
    return sum + qty * unitPrice;
  }, 0);

  const laborTotal = (addon.labor_items || []).reduce((sum, item) => {
    let inv = item.labor_item_id ? laborMap[item.labor_item_id] : null;
    if (!inv && item.name) inv = laborItems.find((l) => l.name?.toLowerCase() === item.name.toLowerCase());
    return sum + (inv ? Number(inv.price) || 0 : 0);
  }, 0);

  const machiningTotal = (addon.machining_items || []).reduce((sum, item) => {
    let inv = item.machining_item_id ? machiningMap[item.machining_item_id] : null;
    if (!inv && item.name) inv = machiningItems.find((m) => m.name?.toLowerCase() === item.name.toLowerCase());
    return sum + (inv ? Number(inv.price) || 0 : 0);
  }, 0);

  const override = Number(addon.price_override);
  if (addon.price_override != null && addon.price_override !== "" && Number.isFinite(override)) return override;

  return partsTotal + laborTotal + machiningTotal;
}