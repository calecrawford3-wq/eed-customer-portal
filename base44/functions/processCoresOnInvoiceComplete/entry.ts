import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    // Only process invoice update events where status changed to "paid"
    const { data, changed_fields } = payload;

    if (!changed_fields?.includes("status")) return Response.json({ skipped: true });
    if (data?.status !== "paid") return Response.json({ skipped: true });

    const lineItems = data.line_items || [];
    const results = [];

    for (const item of lineItems) {
      const qty = Number(item.quantity) || 1;

      // Core credit: customer's core bought/exchanged -> add to inventory
      if (item.is_core_credit && item.core_details) {
        const cd = item.core_details || {};
        const coreNumber = cd.core_number || `CORE-${Date.now().toString().slice(-6)}`;
        const existing = await base44.asServiceRole.entities.EngineCore.filter({ core_number: coreNumber });
        if (existing && existing.length > 0) {
          const core = existing[0];
          const newQty = (Number(core.quantity_on_hand) || 0) + qty;
          await base44.asServiceRole.entities.EngineCore.update(core.id, { quantity_on_hand: newQty });
          results.push({ type: "credit_added", core_number: coreNumber, id: core.id, newQty });
        } else {
          const created = await base44.asServiceRole.entities.EngineCore.create({
            core_number: coreNumber,
            name: cd.name || "Core (from credit)",
            description: cd.description || "",
            category: cd.category || "block",
            condition: cd.condition || "needs_inspection",
            quantity_on_hand: qty,
            unit_cost: Number(cd.unit_cost) || 0,
            sell_price: Number(cd.sell_price) || 0,
            core_credit: Number(cd.core_credit) || 0,
            platform_ids: cd.platform_ids || [],
            status: "active",
          });
          results.push({ type: "credit_created", core_number: coreNumber, id: created.id });
        }
      }

      // Core sell: core sold from inventory -> deduct
      if (item.core_id && !item.is_core_credit) {
        let core = null;
        try {
          const cores = await base44.asServiceRole.entities.EngineCore.filter({ id: item.core_id });
          core = cores && cores[0];
        } catch (e) {
          core = null;
        }
        if (core) {
          const newQty = Math.max(0, (Number(core.quantity_on_hand) || 0) - qty);
          await base44.asServiceRole.entities.EngineCore.update(core.id, { quantity_on_hand: newQty });
          results.push({ type: "sell_deducted", core_id: core.id, name: core.name, from: core.quantity_on_hand, to: newQty });
        }
      }
    }

    return Response.json({ success: true, processed: results });
  } catch (error) {
    console.error(`[processCoresOnInvoiceComplete] Error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});