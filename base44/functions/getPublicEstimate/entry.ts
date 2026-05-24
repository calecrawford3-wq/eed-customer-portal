import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { publicAccessToken } = await req.json();

    if (!publicAccessToken) {
      return Response.json({ error: 'publicAccessToken is required' }, { status: 400 });
    }

    // Fetch estimate by public access token
    const estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token: publicAccessToken });
    
    if (!estimates || estimates.length === 0) {
      return Response.json({ error: 'Estimate not found' }, { status: 404 });
    }

    const est = estimates[0];
    
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