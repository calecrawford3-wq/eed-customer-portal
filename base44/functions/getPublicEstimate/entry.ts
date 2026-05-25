import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { publicAccessToken } = await req.json();

    if (!publicAccessToken) {
      return Response.json({ error: 'publicAccessToken is required' }, { status: 400 });
    }

    // Fetch estimate by public access token (service role—no user auth needed)
    const estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token: publicAccessToken });
    
    if (!estimates || estimates.length === 0) {
      return Response.json({ error: 'Estimate not found' }, { status: 404 });
    }

    const est = estimates[0];
    
    // Fetch customer data (service role)
    const customer = await base44.asServiceRole.entities.Customer.filter({ id: est.customer_id });
    
    // Fetch app settings (service role)
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });

    // Return only safe public fields
    const safeEstimate = {
      id: est.id,
      estimate_number: est.estimate_number,
      status: est.status,
      issue_date: est.issue_date,
      expiry_date: est.expiry_date,
      line_items: est.line_items,
      labor_items: est.labor_items,
      subtotal: est.subtotal,
      tax_rate: est.tax_rate,
      tax_amount: est.tax_amount,
      total: est.total,
      deposit_required: est.deposit_required,
      deposit_amount: est.deposit_amount,
      deposit_paid: est.deposit_paid,
      notes: est.notes,
      stripe_checkout_url: est.stripe_checkout_url,
    };

    const safeCustomer = customer?.[0] ? {
      id: customer[0].id,
      first_name: customer[0].first_name,
      last_name: customer[0].last_name,
      company_name: customer[0].company_name,
      email: customer[0].email,
      phone: customer[0].phone,
      address_line1: customer[0].address_line1,
      address_line2: customer[0].address_line2,
      city: customer[0].city,
      state: customer[0].state,
      zip: customer[0].zip,
    } : null;

    const safeSettings = settings?.[0] ? {
      company_name: settings[0].company_name,
      company_address: settings[0].company_address,
      company_city: settings[0].company_city,
      company_state: settings[0].company_state,
      company_zip: settings[0].company_zip,
      company_phone: settings[0].company_phone,
      company_email: settings[0].company_email,
      company_website: settings[0].company_website,
      company_logo_url: settings[0].company_logo_url,
    } : null;

    return Response.json({
      estimate: safeEstimate,
      customer: safeCustomer,
      settings: safeSettings,
    });
  } catch (error) {
    console.error('Error fetching estimate:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});