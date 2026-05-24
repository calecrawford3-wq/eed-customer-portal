import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { publicAccessToken } = await req.json();

    if (!publicAccessToken) {
      return Response.json({ error: 'publicAccessToken is required' }, { status: 400 });
    }

    // Fetch invoice by public access token
    const invoices = await base44.asServiceRole.entities.Invoice.filter({ public_access_token: publicAccessToken });
    
    if (!invoices || invoices.length === 0) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const inv = invoices[0];
    
    // Fetch customer data
    const customer = await base44.asServiceRole.entities.Customer.filter({ id: inv.customer_id });
    
    // Fetch app settings
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });

    return Response.json({
      invoice: inv,
      customer: customer?.[0] || null,
      settings: settings?.[0] || null,
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});