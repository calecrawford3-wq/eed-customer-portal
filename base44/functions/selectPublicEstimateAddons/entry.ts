import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const { publicAccessToken, selectedUids } = await req.json() as {
      publicAccessToken: string;
      selectedUids: string[];
    };

    if (!publicAccessToken) {
      return Response.json({ error: 'publicAccessToken is required' }, { status: 400 });
    }
    if (!Array.isArray(selectedUids)) {
      return Response.json({ error: 'selectedUids must be an array' }, { status: 400 });
    }

    const estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token: publicAccessToken });
    if (!estimates || estimates.length === 0) {
      return Response.json({ error: 'Estimate not found' }, { status: 404 });
    }
    const est = estimates[0];

    if (est.status !== 'sent') {
      return Response.json({ error: 'This estimate has already been acted on' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const addons = (est.addons || []).map((a: any) => {
      // Only "optional" addons are customer-toggleable. "preselected" stays as-is.
      if (a.selection_state === 'preselected') return a;
      if (selectedUids.includes(a.uid)) {
        return { ...a, selection_state: 'customer_selected', selected_by_customer_at: now };
      }
      // deselect anything the customer previously selected but no longer wants
      if (a.selection_state === 'customer_selected') {
        return { ...a, selection_state: 'optional', selected_by_customer_at: null };
      }
      return a;
    });

    // Recalculate totals including selected addons
    const partTotal = (est.line_items || []).reduce((s: number, l: any) => s + (Number(l.total) || 0), 0);
    const laborTotal = (est.labor_items || []).reduce((s: number, l: any) => s + (Number(l.price) || 0), 0);
    const machiningTotal = (est.machining_items || []).reduce((s: number, m: any) => s + (Number(m.price) || 0), 0);
    const addonTotal = addons
      .filter((a: any) => a.selection_state === 'preselected' || a.selection_state === 'customer_selected')
      .reduce((s: number, a: any) => s + (Number(a.price) || 0), 0);
    const subtotal = partTotal + laborTotal + machiningTotal + addonTotal;
    const tax_amount = partTotal * (Number(est.tax_rate) / 100);
    let discount_amount = 0;
    if (est.discount_type === 'amount') {
      discount_amount = Math.min(Number(est.discount_value) || 0, subtotal);
    } else if (est.discount_type === 'percentage') {
      discount_amount = subtotal * ((Number(est.discount_value) || 0) / 100);
    }
    const shipping = Number(est.shipping_cost) || 0;
    const total = subtotal + tax_amount - discount_amount + shipping;

    await base44.asServiceRole.entities.Estimate.update(est.id, {
      addons,
      subtotal,
      tax_amount,
      discount_amount,
      total,
    });

    // Notify admin
    const chosenLabels = addons.filter((a: any) => a.selection_state === 'customer_selected').map((a: any) => a.name);
    try {
      if (chosenLabels.length > 0) {
        await base44.asServiceRole.functions.invoke('sendAdminNotification', {
          title: 'Customer Selected Addons',
          message: `Customer selected ${chosenLabels.join(', ')} on estimate ${est.estimate_number}. New total: $${total.toFixed(2)}`,
          type: 'estimate_accepted',
          link_url: `/EstimateDetail?id=${est.id}`,
        });
      }
    } catch (e) {
      console.error('Notification failed:', e.message);
    }

    // Re-sync snapshot to public app so the viewer reflects the new total
    try {
      await base44.asServiceRole.functions.invoke('syncEstimateSnapshot', {
        estimateId: est.id,
        publicAccessToken,
      });
    } catch (e) {
      console.warn('Addon snapshot sync failed:', e.message);
    }

    return Response.json({
      success: true,
      estimate: { id: est.id, total, subtotal, addons },
    });
  } catch (error) {
    console.error('Error selecting public estimate addons:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}