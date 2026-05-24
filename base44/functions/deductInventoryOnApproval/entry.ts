import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    // Only process estimate update events where status changed to "approved"
    const { data, old_data, changed_fields } = payload;

    if (!changed_fields?.includes("status")) return Response.json({ skipped: true });
    if (data?.status !== "approved") return Response.json({ skipped: true });

    const lineItems = data.line_items || [];
    const results = [];

    for (const item of lineItems) {
      if (!item.part_id || !item.quantity) continue;

      const parts = await base44.asServiceRole.entities.Part.filter({ id: item.part_id });
      if (!parts || parts.length === 0) continue;

      const part = parts[0];
      const currentQty = Number(part.quantity_on_hand) || 0;
      const newQty = Math.max(0, currentQty - Number(item.quantity));

      await base44.asServiceRole.entities.Part.update(part.id, { quantity_on_hand: newQty });
      results.push({ part_id: part.id, name: part.name, from: currentQty, to: newQty });
    }

    return Response.json({ success: true, deducted: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});