import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { invoiceId } = await req.json();

    if (!invoiceId) {
      return Response.json({ error: 'invoiceId is required' }, { status: 400 });
    }

    // Fetch invoice data as service role (no auth required)
    const invoice = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
    
    if (!invoice || invoice.length === 0) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const inv = invoice[0];
    
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