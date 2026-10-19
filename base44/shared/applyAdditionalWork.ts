// Core "apply an approved AdditionalWork document" logic, extracted so both the
// admin-triggered processApprovedAdditionalWork and the gated auto-apply path
// (customer approval behind a setting) run the SAME idempotent processing.
//
// Idempotency: if aw.processed_at is set, returns already_processed without
// re-running. Duplicate prevention: machining tasks are keyed by
// source_type=additional_work + source_id=aw.id; invoice machining items get
// stable uids matching charge_keys. Scope/version validation: the aw record
// is re-read fresh inside the caller; this core operates on the passed aw.
//
// This function performs NO auth check — the caller MUST verify identity and
// entitlement before calling. It runs entirely asServiceRole.

import { nameToTaskType } from './machiningTask.ts';

function round2(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function appendVersion(aw: any, reason: string, actor: string, total: number) {
  const hist = Array.isArray(aw.version_history) ? [...aw.version_history] : [];
  hist.push({ version: (aw.version || 1), changed_at: new Date().toISOString(), changed_by: actor, reason, total: Number(total) || 0 });
  return hist;
}

export async function applyApprovedAdditionalWork(base44: any, aw: any, actor: string) {
  // Idempotency guard — never reprocess.
  if (aw.processed_at) {
    return { ok: true, already_processed: true, invoice_id: aw.invoice_id };
  }
  if (aw.status !== 'pending') {
    return { ok: false, error: 'Only pending work can be approved' };
  }

  const jobRes = await base44.asServiceRole.entities.Job.filter({ id: aw.job_id });
  const job = (jobRes.items || jobRes || [])[0];
  if (!job) return { ok: false, error: 'Linked job not found' };

  const now = new Date().toISOString();
  const operation_id = `additionalwork:${aw.id}`;
  const estimateId = job.estimate_id || `additionalwork:${aw.id}`;
  const buildId = job.build_id || '';
  const reservationIds: string[] = [];
  const taskIds: string[] = [];

  // 1. Reserve parts
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

  // 2. Append to / create invoice
  let invoiceId = aw.invoice_id || '';
  let invoice: any = null;
  if (invoiceId) {
    const invRes = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
    invoice = (invRes.items || invRes || [])[0];
  }
  if (!invoice && job.invoice_ids && job.invoice_ids.length > 0) {
    const invRes = await base44.asServiceRole.entities.Invoice.filter({ id: { $in: job.invoice_ids } });
    const invs = invRes.items || invRes || [];
    invoice = invs.find((i: any) => i.status === 'draft' || i.status === 'sent') || invs[0];
  }
  if (invoice) invoiceId = invoice.id;

  const newLineItems = (aw.line_items || []).map((li: any) => ({ ...li, engine_section: li.engine_section || 'Additional Work' }));
  const newLaborItems = [
    ...(aw.labor_items || []).map((l: any) => ({ ...l, engine_section: l.engine_section || 'Additional Work' })),
    ...(aw.outsourced_services || []).map((s: any) => ({
      name: s.name, description: s.vendor ? `${s.vendor}${s.description ? ': ' + s.description : ''}` : (s.description || ''),
      price: s.price, engine_section: 'Additional Work',
    })),
  ];
  const newMachiningItems = (aw.machining_items || []).map((m: any, i: number) => ({
    ...m, uid: `aw:${aw.id}:mach:${i}`, engine_section: m.engine_section || 'Additional Work',
  }));

  const partsTotal = newLineItems.reduce((s: number, li: any) => s + (Number(li.total) || 0), 0);
  const laborTotal = newLaborItems.reduce((s: number, l: any) => s + (Number(l.price) || 0), 0);
  const machTotal = newMachiningItems.reduce((s: number, m: any) => s + (Number(m.price) || 0) * (Number(m.quantity) || 1), 0);
  const addedSubtotal = round2(partsTotal + laborTotal + machTotal);

  if (invoice) {
    const line_items = [...(invoice.line_items || []), ...newLineItems];
    const labor_items = [...(invoice.labor_items || []), ...newLaborItems];
    const machining_items = [...(invoice.machining_items || []), ...newMachiningItems];
    const allParts = line_items.reduce((s: number, li: any) => s + (Number(li.total) || 0), 0);
    const allLabor = labor_items.reduce((s: number, l: any) => s + (Number(l.price) || 0), 0);
    const allMach = machining_items.reduce((s: number, m: any) => s + (Number(m.price) || 0) * (Number(m.quantity) || 1), 0);
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

  // 3. Build tasks per finding
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

  // 3b. Machining tasks (linked, deduped by source)
  const machiningTaskIds: string[] = [];
  const existingMachRes = await base44.asServiceRole.entities.MachiningTask.filter(
    { job_id: job.id, source_type: 'additional_work', source_id: aw.id }, { limit: 500 }
  );
  const existingMach = existingMachRes.items || existingMachRes || [];
  if (existingMach.length === 0) {
    const nextMachSort = 10000;
    const machRecords: any[] = [];
    for (let i = 0; i < (aw.machining_items || []).length; i++) {
      const m = aw.machining_items[i];
      machRecords.push({
        job_id: job.id, build_id: buildId, customer_engine_id: job.customer_engine_id || '', customer_id: job.customer_id || '',
        task_type: nameToTaskType(m.name), task_label: m.name, affected_component: '',
        instructions: m.description || '', is_required: true, sort_order: nextMachSort + i, status: 'pending',
        billable: true, customer_description: m.name, quantity: Number(m.quantity) || 1, customer_price: Number(m.price) || 0,
        cost_type: m.cost_type || 'unspecified', vendor: m.vendor || '', billing_status: 'linked',
        invoice_id: invoiceId, charge_key: `aw:${aw.id}:mach:${i}`, source_type: 'additional_work', source_id: aw.id,
      });
    }
    for (const fid of (aw.finding_ids || [])) {
      const fRes = await base44.asServiceRole.entities.TeardownFinding.filter({ id: fid });
      const f = (fRes.items || fRes || [])[0];
      if (!f) continue;
      for (let j = 0; j < (f.machining_items || []).length; j++) {
        const m = f.machining_items[j];
        machRecords.push({
          job_id: job.id, build_id: buildId, customer_engine_id: job.customer_engine_id || '', customer_id: job.customer_id || '',
          task_type: nameToTaskType(m.name), task_label: m.name, affected_component: f.component || '',
          instructions: m.description || '', is_required: true, sort_order: nextMachSort + machRecords.length, status: 'pending',
          billable: true, customer_description: m.name, quantity: 1, customer_price: Number(m.price) || 0,
          cost_type: m.cost_type || 'unspecified', vendor: m.vendor || '', billing_status: 'linked',
          invoice_id: invoiceId, charge_key: `aw:${aw.id}:find:${fid}:mach:${j}`, source_type: 'additional_work',
          source_id: aw.id, finding_id: fid,
        });
      }
    }
    if (machRecords.length > 0) {
      const created = await base44.asServiceRole.entities.MachiningTask.bulkCreate(machRecords);
      const createdTasks = created.records || created || [];
      for (const t of createdTasks) machiningTaskIds.push(t.id);
    }
  }

  // Mark findings approved
  for (const fid of (aw.finding_ids || [])) {
    await base44.asServiceRole.entities.TeardownFinding.update(fid, { status: 'approved', additional_work_id: aw.id });
  }

  // Recompute parts readiness
  if (job.estimate_id) {
    const allRes = await base44.asServiceRole.entities.PartReservation.filter({
      estimate_id: job.estimate_id, status: { $in: ['reserved', 'partially_consumed'] },
    });
    const hasShort = (allRes.items || allRes || []).some((r: any) => (Number(r.quantity_short) || 0) > 0);
    await base44.asServiceRole.entities.Job.update(job.id, { parts_readiness: hasShort ? 'waiting_on_parts' : 'ready' });
  }

  await base44.asServiceRole.entities.AdditionalWork.update(aw.id, {
    status: 'approved', approved_at: now, approved_by: actor, processed_at: now,
    invoice_id: invoiceId, reservation_ids: reservationIds, task_ids: taskIds,
    version_history: appendVersion(aw, 'approved & processed', actor, aw.total),
  });

  try {
    await base44.asServiceRole.functions.invoke('syncMachiningTaskBilling', { job_id: job.id });
  } catch (e) { /* best-effort */ }

  return {
    ok: true, status: 'approved', invoice_id: invoiceId,
    reservations: reservationIds.length, tasks: taskIds.length,
    machining_tasks: machiningTaskIds.length, added_subtotal: addedSubtotal,
  };
}