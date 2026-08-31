import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { comparison_public_token } = body as { comparison_public_token: string };

    if (!comparison_public_token) {
      return Response.json({ error: 'comparison_public_token is required' }, { status: 400 });
    }

    const estimates = await base44.asServiceRole.entities.Estimate.filter({ comparison_public_token });
    if (!estimates || estimates.length === 0) {
      return Response.json({ error: 'Comparison not found' }, { status: 404 });
    }

    const sorted = estimates.sort((a, b) => (a.comparison_sort_order || 0) - (b.comparison_sort_order || 0));
    const first = sorted[0];

    // Fetch customer + settings + engine + platform (shared across group)
    const customerRec = await base44.asServiceRole.entities.Customer.filter({ id: first.customer_id });
    const customer = customerRec?.[0] || null;

    const settingsRec = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const settings = settingsRec?.[0] || null;

    let customerEngine = null;
    let platform = null;
    if (first.customer_engine_id) {
      const engines = await base44.asServiceRole.entities.CustomerEngine.filter({ id: first.customer_engine_id });
      customerEngine = engines?.[0] || null;
      if (customerEngine?.platform_id) {
        const platforms = await base44.asServiceRole.entities.EnginePlatform.filter({ id: customerEngine.platform_id });
        platform = platforms?.[0] || null;
      }
    }

    // Build safe stage objects — strip part_numbers and costs per customer-facing preference
    const stages = sorted.map(est => ({
      id: est.id,
      estimate_number: est.estimate_number,
      status: est.status,
      comparison_stage_label: est.comparison_stage_label,
      comparison_sort_order: est.comparison_sort_order,
      comparison_choice: est.comparison_choice || 'none',
      comparison_interest: est.comparison_interest || false,
      comparison_interest_note: est.comparison_interest_note || '',
      issue_date: est.issue_date,
      expiry_date: est.expiry_date,
      line_items: (est.line_items || []).map((li: any) => ({
        item_name: li.item_name,
        quantity: li.quantity,
        unit_price: li.unit_price,
        total: li.total,
      })),
      labor_items: (est.labor_items || []).map((li: any) => ({
        name: li.name,
        description: li.description,
        price: li.price,
      })),
      machining_items: (est.machining_items || []).map((mi: any) => ({
        name: mi.name,
        description: mi.description,
        price: mi.price,
      })),
      subtotal: est.subtotal,
      tax_rate: est.tax_rate,
      tax_amount: est.tax_amount,
      total: est.total,
      deposit_required: est.deposit_required,
      deposit_amount: est.deposit_amount,
      deposit_paid: est.deposit_paid,
      notes: est.notes,
      stripe_checkout_url: est.stripe_checkout_url,
      contains_illegal_parts: est.contains_illegal_parts || false,
    }));

    const safeCustomer = customer ? {
      id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      company_name: customer.company_name,
      email: customer.email,
      phone: customer.phone,
    } : null;

    const safeSettings = settings ? {
      company_name: settings.company_name,
      company_address: settings.company_address,
      company_phone: settings.company_phone,
      company_email: settings.company_email,
      company_website: settings.company_website,
      company_logo_url: settings.company_logo_url,
    } : null;

    return Response.json({
      stages,
      ai_summary: first.comparison_ai_summary || '',
      customer: safeCustomer,
      settings: safeSettings,
      customerEngine: customerEngine ? { eed_id: customerEngine.eed_id, engine_serial_number: customerEngine.engine_serial_number } : null,
      platform: platform ? { name: platform.name, manufacturer: platform.manufacturer, year_range_start: platform.year_range_start, year_range_end: platform.year_range_end } : null,
    });
  } catch (error) {
    console.error('Error fetching public comparison:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}