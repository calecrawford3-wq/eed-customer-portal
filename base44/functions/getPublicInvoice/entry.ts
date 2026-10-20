import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { serializeAdditionalWorkWithPhotos } from '../../shared/findingPhotos.ts';
import { publicCapability, publicCompanySettings } from '../../shared/publicCapability.ts';
import { guestInvoicePayload, guestCustomer, guestEngine } from '../../shared/guestFields.ts';
import { portalItems } from '../../shared/portalDocument.ts';

export default async function(req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const { publicAccessToken } = await req.json();
    if (!publicCapability(publicAccessToken)) return Response.json({ error: 'Valid publicAccessToken required' }, { status: 400 });
    const inv = portalItems(await base44.asServiceRole.entities.Invoice.filter({ public_access_token: publicAccessToken }))[0];
    if (!inv || !['sent', 'partial', 'paid', 'overdue', 'void'].includes(inv.status)) return Response.json({ error: 'Invoice not found' }, { status: 404 });
    const customer = portalItems(await base44.asServiceRole.entities.Customer.filter({ id: inv.customer_id }))[0];
    const settings = portalItems(await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' }))[0];
    const engine = inv.customer_engine_id ? portalItems(await base44.asServiceRole.entities.CustomerEngine.filter({ id: inv.customer_engine_id, customer_id: inv.customer_id }))[0] : null;
    const additionalWork = [];
    const requests = portalItems(await base44.asServiceRole.entities.AdditionalWork.filter({ invoice_id: inv.id, customer_id: inv.customer_id, status: 'approved' }, { limit: 50 }));
    for (const aw of requests.filter(a => a.submitted_at)) additionalWork.push(await serializeAdditionalWorkWithPhotos(base44, aw));
    const payload = guestInvoicePayload(inv, customer, engine);
    return Response.json({
      invoice: { ...payload, id: inv.id, invoice_number: inv.invoice_number,
        tax_rate: inv.tax_rate, discount_type: inv.discount_type, discount_value: inv.discount_value, discount_amount: inv.discount_amount,
        shipping_cost: inv.shipping_cost, due_on_completion: inv.due_on_completion,
        stripe_checkout_url: inv.stripe_checkout_url,
        payments: (inv.payments || []).map(p => ({ amount: p.amount, method: p.method, date: p.date })) },
      customer: guestCustomer(customer), settings: publicCompanySettings(settings), customerEngine: guestEngine(engine),
      platform: null, additional_work: additionalWork,
    }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return Response.json({ error: 'Unable to load invoice' }, { status: 500 }); }
}
