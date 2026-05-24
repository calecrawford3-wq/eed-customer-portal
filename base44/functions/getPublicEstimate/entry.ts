import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { estimateId } = await req.json();

    if (!estimateId) {
      return Response.json({ error: 'estimateId is required' }, { status: 400 });
    }

    // Fetch estimate data as service role (no auth required)
    const estimate = await base44.asServiceRole.entities.Estimate.filter({ id: estimateId });
    
    if (!estimate || estimate.length === 0) {
      return Response.json({ error: 'Estimate not found' }, { status: 404 });
    }

    const est = estimate[0];
    
    // Fetch customer data
    const customer = await base44.asServiceRole.entities.Customer.filter({ id: est.customer_id });
    
    // Fetch app settings
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });

    return Response.json({
      estimate: est,
      customer: customer?.[0] || null,
      settings: settings?.[0] || null,
    });
  } catch (error) {
    console.error('Error fetching estimate:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});