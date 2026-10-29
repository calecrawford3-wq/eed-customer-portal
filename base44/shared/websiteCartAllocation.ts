// Turns a paid WebsiteCartOrder into Elite records: customer, invoice, engine jobs,
// parts fulfillment and inventory movement. Every step is retry-safe.
const rows = (value: any): any[] => Array.isArray(value) ? value : value?.items || [];

async function ensureCartCustomer(svc: any, order: any) {
  if (order.customer_id) return order.customer_id;
  const matches = rows(await svc.entities.Customer.filter({ email: order.buyer_email }));
  if (matches.length === 1) {
    await svc.entities.WebsiteCartOrder.update(order.id, { customer_id: matches[0].id });
    return matches[0].id;
  }
  if (matches.length > 1) throw new Error('Customer identity needs staff review');
  const nameParts = String(order.buyer_name || '').trim().split(/\s+/).filter(Boolean);
  const first = nameParts.shift() || 'Website';
  const last = nameParts.join(' ') || 'Customer';
  const address = order.shipping_address || {};
  const created = await svc.entities.Customer.create({
    first_name: first.slice(0, 60),
    last_name: last.slice(0, 60),
    email: order.buyer_email,
    phone: String(order.buyer_phone || '').slice(0, 40),
    address_line1: String(address.line1 || '').slice(0, 160),
    address_line2: String(address.line2 || '').slice(0, 160),
    city: String(address.city || '').slice(0, 100),
    state: String(address.state || '').slice(0, 60),
    zip: String(address.postal_code || '').slice(0, 20),
    country: String(address.country || 'US').slice(0, 2),
    status: 'active',
    notes: 'Created automatically from a website store purchase.',
  });
  await svc.entities.WebsiteCartOrder.update(order.id, { customer_id: created.id });
  return created.id;
}

export async function allocateWebsiteCartOrder(svc: any, orderId: string) {
  const entity = svc.entities.WebsiteCartOrder;
  let order = rows(await entity.filter({ id: orderId }))[0];
  if (!order) throw new Error('Order not found');
  if (order.processed_at) {
    return { duplicate: true, orderReference: order.order_reference, invoiceId: order.invoice_id || '', jobIds: order.engine_job_ids || [], fulfillmentId: order.fulfillment_id || '' };
  }
  if (!order.paid_at || !order.stripe_payment_intent || !order.stripe_session_id) throw new Error('A verified payment is required');
  if (order.processing_claim) throw new Error('Order processing already claimed; staff recovery required');
  const claim = crypto.randomUUID();
  await entity.updateMany(
    { id: order.id, $or: [{ processing_claim: { $exists: false } }, { processing_claim: '' }, { processing_claim: null }] },
    { $set: { processing_claim: claim, processing_started_at: new Date().toISOString(), status: 'processing' } },
  );
  order = rows(await entity.filter({ id: order.id }))[0];
  if (order?.processing_claim !== claim) throw new Error('Order processing already claimed');

  const lines = order.items_snapshot || [];
  if (!lines.length || lines.some((line: any) => !['engine', 'part'].includes(line.type))) throw new Error('Invalid order snapshot');
  const sum = (field: string) => lines.reduce((total: number, line: any) => total + Number(line[field] || 0), 0);
  if (sum('totalCents') !== order.subtotal_cents || sum('dueCents') !== order.due_today_cents || sum('totalCents') - sum('dueCents') !== order.remaining_engine_cents) throw new Error('Order allocation does not reconcile');
  if (!Number.isSafeInteger(order.total_charge_cents) || order.total_charge_cents !== order.due_today_cents + (order.tax_cents || 0) + (order.shipping_cents || 0) + (order.fee_cents || 0)) throw new Error('Stripe charge allocation does not reconcile');

  const customerId = await ensureCartCustomer(svc, order);
  const invoiceNumber = 'WEB-' + order.order_reference;
  let invoice = rows(await svc.entities.Invoice.filter({ invoice_number: invoiceNumber }))[0];
  if (!invoice) {
    const lineItems = lines.map((line: any, index: number) => {
      const quantity = line.type === 'part' ? Math.max(1, Number(line.quantity) || 1) : 1;
      const total = Number(line.totalCents || 0) / 100;
      return {
        item_name: line.name || `${line.type} ${index + 1}`,
        part_id: line.type === 'part' ? line.partId : '',
        part_number: line.sku || '',
        quantity,
        unit_price: total / quantity,
        total,
        engine_section: line.type === 'engine' ? `Engine ${index + 1}` : '',
      };
    });
    invoice = await svc.entities.Invoice.create({
      invoice_number: invoiceNumber,
      customer_id: customerId,
      status: order.remaining_engine_cents > 0 ? 'partial' : 'paid',
      issue_date: new Date().toISOString().slice(0, 10),
      is_combined: true,
      line_items: lineItems,
      subtotal: order.subtotal_cents / 100,
      tax_rate: (order.tax_cents || 0) > 0 ? Math.round((order.tax_cents / Math.max(1, order.due_today_cents)) * 10000) / 100 : 0,
      tax_amount: (order.tax_cents || 0) / 100,
      tax_classification: (order.tax_cents || 0) > 0 ? 'oklahoma_pickup' : 'out_of_state',
      shipping_cost: (order.shipping_cents || 0) / 100,
      total: (order.subtotal_cents + (order.tax_cents || 0) + (order.shipping_cents || 0) + (order.fee_cents || 0)) / 100,
      amount_paid: order.total_charge_cents / 100,
      balance_due: order.remaining_engine_cents / 100,
      notes: `Website order ${order.order_reference} · ${order.shipping_method === 'pickup' ? 'Local pickup' : 'Shipped'}`,
      payments: [{
        amount: order.total_charge_cents / 100,
        method: 'card',
        date: new Date(order.paid_at).toISOString().slice(0, 10),
        note: `Verified website Stripe payment ${order.stripe_session_id} / ${order.stripe_payment_intent}`,
        stripe_session_id: order.stripe_session_id,
        stripe_payment_intent: order.stripe_payment_intent,
      }],
    });
  }
  await entity.update(order.id, { invoice_id: invoice.id });

  const jobs: string[] = [];
  let sequence = 0;
  for (const line of lines) {
    if (line.type !== 'engine') continue;
    sequence++;
    const number = `${order.order_reference}-E${String(sequence).padStart(2, '0')}`;
    let job = rows(await svc.entities.Job.filter({ job_number: number }))[0];
    if (!job) {
      job = await svc.entities.Job.create({
        job_number: number,
        customer_id: customerId,
        invoice_ids: [invoice.id],
        is_engine_build: true,
        service_package: `stage_${line.stage}`,
        stage: 'queued',
        is_active: false,
        deposit_required: true,
        deposit_amount: line.dueCents / 100,
        deposit_met: true,
        parts_readiness: 'unknown',
        blocking_condition: 'none',
      });
    }
    jobs.push(job.id);
    await entity.update(order.id, { engine_job_ids: jobs });
  }

  // Inventory moves once, on the same guarded run that records fulfillment.
  const shortages: string[] = [];
  for (const line of lines.filter((item: any) => item.type === 'part')) {
    const part = rows(await svc.entities.Part.filter({ id: line.partId }))[0];
    if (!part) { shortages.push(`${line.name || line.sku || line.partId} (removed from inventory)`); continue; }
    const quantity = Number(line.quantity) || 0;
    const onHand = Number(part.quantity_on_hand) || 0;
    if (onHand < quantity) shortages.push(`${line.name || line.sku || part.part_number} (${onHand} of ${quantity} in stock)`);
    await svc.entities.Part.update(part.id, { quantity_on_hand: Math.max(0, onHand - quantity) });
  }

  const partLines = lines.filter((line: any) => line.type === 'part');
  let fulfillmentId = order.fulfillment_id || '';
  if (partLines.length) {
    let fulfillment = rows(await svc.entities.WebsitePartsFulfillment.filter({ purchase_id: order.id }))[0];
    if (!fulfillment) {
      fulfillment = await svc.entities.WebsitePartsFulfillment.create({
        purchase_id: order.id,
        order_number: order.order_reference,
        customer_id: customerId,
        invoice_id: invoice.id,
        status: 'ready_to_pick',
        payment_verified: true,
        recipient_name: order.buyer_name,
        recipient_email: order.buyer_email,
        shipping_address: JSON.stringify(order.shipping_address || {}),
        shipping_method: order.shipping_method,
        line_items: partLines.map((line: any) => ({ part_id: line.partId, sku: line.sku || '', name: line.name, quantity: line.quantity, unit_price_cents: line.unitCents, quantity_picked: 0 })),
        subtotal_cents: partLines.reduce((total: number, line: any) => total + line.totalCents, 0),
        shipping_cents: order.shipping_cents || 0,
        tax_cents: order.tax_cents || 0,
      });
    }
    fulfillmentId = fulfillment.id;
  }

  await entity.update(order.id, {
    status: 'paid',
    processed_at: new Date().toISOString(),
    processing_claim: '',
    invoice_id: invoice.id,
    engine_job_ids: jobs,
    fulfillment_id: fulfillmentId,
    fulfillment_error: shortages.length ? 'Inventory shortage when payment cleared: ' + shortages.join('; ') : '',
  });
  return { duplicate: false, orderReference: order.order_reference, invoiceId: invoice.id, jobIds: jobs, fulfillmentId, shortages };
}