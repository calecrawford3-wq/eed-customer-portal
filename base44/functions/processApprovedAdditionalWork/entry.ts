import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Applies an approved AdditionalWork document to the job's reservations, draft
// invoice, and workflow tasks EXACTLY ONCE. Idempotent via processed_at.
// Actions: approve (processes), decline, cancel.
// Pending or declined work is never billed.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { additional_work_id, action, customer_note } = body;
    if (!additional_work_id) return Response.json({ error: 'additional_work_id required' }, { status: 400 });
    if (!['approve', 'decline', 'cancel'].includes(action)) return Response.json({ error: 'invalid action' }, { status: 400 });

    const awRes = await base44.asServiceRole.entities.AdditionalWork.filter({ id: additional_work_id });
    const aw = (awRes.items || awRes || [])[0];
    if (!aw) return Response.json({ error: 'Additional work not found' }, { status: 404 });

    const now = new Date().toISOString();
    const actor = user.full_name || user.email || 'admin';

    // --- Decline ---
    if (action === 'decline') {
      if (aw.status === 'approved' || aw.processed_at) return Response.json({ error: 'Cannot decline already-approved work' }, { status: 400 });
      await base44.asServiceRole.entities.AdditionalWork.update(aw.id, {
        status: 'declined', declined_at: now, customer_note: customer_note || '',
        version_history: appendVersion(aw, 'declined', actor, aw.total),
      });
      for (const fid of (aw.finding_ids || [])) {
        await base44.asServiceRole.entities.TeardownFinding.update(fid, { status: 'open', additional_work_id: '' });
      }
      return Response.json({ ok: true, status: 'declined' });
    }

    // --- Cancel ---
    if (action === 'cancel') {
      if (aw.processed_at) return Response.json({ error: 'Cannot cancel already-processed work' }, { status: 400 });
      await base44.asServiceRole.entities.AdditionalWork.update(aw.id, {
        status: 'canceled', canceled_at: now,
        version_history: appendVersion(aw, 'canceled', actor, aw.total),
      });
      for (const fid of (aw.finding_ids || [])) {
        await base44.asServiceRole.entities.TeardownFinding.update(fid, { status: 'open', additional_work_id: '' });
      }
      return Response.json({ ok: true, status: 'canceled' });
    }

    // --- Approve & process ---
    if (aw.status !== 'pending') return Response.json({ error: 'Only pending work can be approved' }, { status: 400 });
    if (aw.processed_at) return Response.json({ ok: true, already_processed: true, invoice_id: aw.invoice_id });

    const jobRes = await base44.asServiceRole.entities.Job.filter({ id: aw.job_id });
    const job = (jobRes.items || jobRes || [])[0];
    if (!job) return Response.json({ error: 'Linked job not found' }, { status: 404 });

    const operation_id = `additionalwork:${aw.id}`;
    const estimateId = job.estimate_id || `additionalwork:${aw.id}`;
    const buildId = job.build_id || '';
    const reservationIds = [];
    const taskIds = [];

    // 1. Reserve additional-work parts against the job's estimate/build
    for (const li of (aw.line_items || [])) {
      if (!li.part_id) continue;
      const partsRes = await base44.asServiceRole.entities.Part.filter({ id: li.part_id });
      const part = (partsRes.items || partsRes || [])[0];
      const onHand = part ? Number(part.quantity_on_hand) || 0 : 0;
      const required = Number(li.quantity) || 0;
      const existingRes = await base44.asServiceRole.entities.PartReservation.filter({
        part_id: li.part_id, status: { $in: ['reserved', 'partially_consumed'] },
      });
      let reservedByOthers = 0;
      for (const r of (existingRes.items || existingRes || [])) {
        if (r.operation_id && r.operation_id.startsWith('additionalwork:')) continue;
        reservedByOthers += Number(r.quantity_reserved) || 0;
      }
      const available = Math.max(0, onHand - reservedByOthers);
      const reserved = Math.min(required, available);
      const short = Math.max(0, required - reserved);
      const created = await base44.asServiceRole.entities.PartReservation.create({
        estimate_id: estimateId, build_id: buildId, part_id: li.part_id,
        part_number: li.part_number || (part ? part.part_number : ''),
        part_name: li.item_name || (part ? part.name : ''),
        quantity_required: required, quantity_reserved: reserved, quantity_short: short,
        quantity_consumed: 0, status: 'reserved', operation_id,
      });
      reservationIds.push(created.id);
    }

    // 2. Append work to the job's draft invoice (or create one)
    let invoiceId = aw.invoice_id || '';
    let invoice = null;
    if (invoiceId) {
      const invRes = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
      invoice = (invRes.items || invRes || [])[0];
    }
    if (!invoice && job.invoice_ids && job.invoice_ids.length > 0) {
      const invRes = await base44.asServiceRole.entities.Invoice.filter({ id: { $in: job.invoice_ids } });
      const invs = invRes.items || invRes || [];
      invoice = invs.find(i => i.status === 'draft' || i.status === 'sent') || invs[0];
    }
    if (invoice) invoiceId = invoice.id;

    const newLineItems = (aw.line_items || []).map(li => ({ ...li, engine_section: li.engine_section || 'Additional Work' }));
    const newLaborItems = [
      ...(aw.labor_items || []).map(l => ({ ...l, engine_section: l.engine_section || 'Additional Work' })),
      ...(aw.outsourced_services || []).map(s => ({
        name: s.name, description: s.vendor ? `${s.vendor}${s.description ? ': ' + s.description : ''}` : (s.description || ''),
        price: s.price, engine_section: 'Additional Work',
      })),
    ];
    const newMachiningItems = (aw.machining_items || []).map(m => ({ ...m, engine_section: m.engine_section || 'Additional Work' }));

    const partsTotal = newLineItems.reduce((s, li) => s + (Number(li.total) || 0), 0);
    const laborTotal = newLaborItems.reduce((s, l) => s + (Number(l.price) || 0), 0);
    const machTotal = newMachiningItems.reduce((s, m) => s + (Number(m.price) || 0), 0);
    const addedSubtotal = round2(partsTotal + laborTotal + machTotal);

    if (invoice) {
      const line_items = [...(invoice.line_items || []), ...newLineItems];
      const labor_items = [...(invoice.labor_items || []), ...newLaborItems];
      const machining_items = [...(invoice.machining_items || []), ...newMachiningItems];
      const allParts = line_items.reduce((s, li) => s + (Number(li.total) || 0), 0);
      const allLabor = labor_items.reduce((s, l) => s + (Number(l.price) || 0), 0);
      const allMach = machining_items.reduce((s, m) => s + (Number(m.price) || 0), 0);
      const subtotal = round2(allParts + allLabor + allMach);
      const taxRate = Number(invoice.tax_rate) || 0;
      const taxAmount = round2(subtotal * taxRate / 100);
      const discount = Number(invoice.discount_amount) || 0;
      const shipping = Number(invoice.shipping_cost) || 0;
      const credits = Number(invoice.applied_credits) || 0;
      const total = round2(subtotal + taxAmount - discount + shipping);
      const amountPaid = Number(invoice.amount_paid) || 0;
      const balanceDue = round2(Math.max(0, total - credits - amountPaid));
      const status = balanceDue < 0.01 ? 'paid' : (amountPaid > 0 ? 'partial' : invoice.status);
      await base44.asServiceRole.entities.Invoice.update(invoice.id, {
        line_items, labor_items, machining_items, subtotal, tax_amount: taxAmount, total, balance_due: balanceDue, status,
      });
    } else {
      const taxRate = Number(aw.tax_rate) || 0;
      const taxAmount = round2(addedSubtotal * taxRate / 100);
      const total = round2(addedSubtotal + taxAmount);
      const num = `INV-AW-${Date.now().toString().slice(-6)}`;
      const created = await base44.asServiceRole.entities.Invoice.create({
        invoice_number: num, customer_id: job.customer_id, build_id: buildId,
        customer_engine_id: job.customer_engine_id || '', estimate_id: job.estimate_id || '',
        status: 'draft', issue_date: now.split('T')[0],
        line_items: newLineItems, labor_items: newLaborItems, machining_items: newMachiningItems,
        subtotal: addedSubtotal, tax_rate: taxRate, tax_amount: taxAmount, total,
        amount_paid: 0, balance_due: total,
      });
      invoiceId = created.id;
      const invoiceIds = [...(job.invoice_ids || []), invoiceId];
      await base44.asServiceRole.entities.Job.update(job.id, { invoice_ids: invoiceIds });
    }

    // 3. Create workflow tasks for the build (one per finding)
    if (buildId) {
      for (const fid of (aw.finding_ids || [])) {
        const fRes = await base44.asServiceRole.entities.TeardownFinding.filter({ id: fid });
        const f = (fRes.items || fRes || [])[0];
        if (!f) continue;
        const task = await base44.asServiceRole.entities.BuildTask.create({
          build_id: buildId, template_name: 'Additional Work',
          name: `Additional: ${f.component} — ${(f.recommended_action || 'repair').replace(/_/g, ' ')}`,
          stage: 'assembly', sort_order: 9999, status: 'pending',
        });
        taskIds.push(task.id);
      }
    }

    // Mark findings approved
    for (const fid of (aw.finding_ids || [])) {
      await base44.asServiceRole.entities.TeardownFinding.update(fid, { status: 'approved', additional_work_id: aw.id });
    }

    // Recompute job parts readiness
    if (job.estimate_id) {
      const allRes = await base44.asServiceRole.entities.PartReservation.filter({
        estimate_id: job.estimate_id, status: { $in: ['reserved', 'partially_consumed'] },
      });
      const hasShort = (allRes.items || allRes || []).some(r => (Number(r.quantity_short) || 0) > 0);
      await base44.asServiceRole.entities.Job.update(job.id, { parts_readiness: hasShort ? 'waiting_on_parts' : 'ready' });
    }

    await base44.asServiceRole.entities.AdditionalWork.update(aw.id, {
      status: 'approved', approved_at: now, approved_by: actor, processed_at: now,
      invoice_id: invoiceId, reservation_ids: reservationIds, task_ids: taskIds,
      version_history: appendVersion(aw, 'approved & processed', actor, aw.total),
    });

    return Response.json({
      ok: true, status: 'approved', invoice_id: invoiceId,
      reservations: reservationIds.length, tasks: taskIds.length, added_subtotal: addedSubtotal,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function round2(n) { const v = Number(n); if (!Number.isFinite(v)) return 0; return Math.round((v + Number.EPSILON) * 100) / 100; }

function appendVersion(aw, reason, actor, total) {
  const hist = Array.isArray(aw.version_history) ? [...aw.version_history] : [];
  hist.push({ version: (aw.version || 1), changed_at: new Date().toISOString(), changed_by: actor, reason, total: Number(total) || 0 });
  return hist;
}