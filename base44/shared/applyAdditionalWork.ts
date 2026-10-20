// Core "apply an approved AdditionalWork document" logic, extracted so both the
// admin-triggered processApprovedAdditionalWork and the gated auto-apply path
// (customer approval behind a setting) run the SAME idempotent processing.
//
// RELIABILITY / CONCURRENCY:
//  - Atomic claim: a conditional updateMany writes a unique processing_claim_token
//    only if no claim token and no processed_at exist. The token is re-read to
//    confirm ownership; a concurrent caller that loses the race returns early.
//  - Idempotent sub-operations: reservations are keyed by operation_id+part_id;
//    machining tasks by source_type+source_id; invoice line/labor/machining items
//    by stable aw_*_uid; build tasks by additional_work_id+name. A retry after a
//    mid-flow failure resumes without duplicating any of these.
//  - Failure state: on error, processing_state='failed' + processing_error are
//    set and the claim token is cleared, so a retry can re-claim and resume.
//  - Reservations belonging to OTHER additional-work requests are counted as
//    "reserved by others" when computing available stock (operation_id prefix
//    check), so one AW does not consume another's reserved stock.
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
  // Idempotency guard — never reprocess fully-completed work.
  if (aw.processed_at || aw.processing_state === 'processed') {
    return { ok: true, already_processed: true, invoice_id: aw.invoice_id };
  }
  if (aw.status !== 'pending') {
    return { ok: false, error: 'Only pending work can be approved' };
  }

  if (aw.customer_response !== 'approved' || Number(aw.customer_approved_version || 0) !== Number(aw.version || 1)) {
    return { ok: false, error: 'Customer approval of the current version is required' };
  }

  // --- Atomic claim: win exclusive ownership before doing any work ---
  const claimToken = crypto.randomUUID();
  await base44.asServiceRole.entities.AdditionalWork.updateMany(
    { id: aw.id, processed_at: { $exists: false }, processing_claim_token: { $exists: false } },
    { $set: { processing_claim_token: claimToken, processing_state: 'processing' } }
  );
  const reRes = await base44.asServiceRole.entities.AdditionalWork.filter({ id: aw.id });
  const claimed = (reRes.items || reRes || [])[0];
  if (!claimed || claimed.processing_claim_token !== claimToken) {
    // Another worker is processing or just finished — let the caller retry later.
    return { ok: true, already_processing: true, invoice_id: aw.invoice_id };
  }

  const jobRes = await base44.asServiceRole.entities.Job.filter({ id: aw.job_id });
  const job = (jobRes.items || jobRes || [])[0];
  if (!job) {
    await base44.asServiceRole.entities.AdditionalWork.update(aw.id, {
      processing_state: 'failed', processing_error: 'Linked job not found', processing_claim_token: '',
    });
    return { ok: false, error: 'Linked job not found' };
  }

  const now = new Date().toISOString();
  const operation_id = `additionalwork:${aw.id}`;
  const estimateId = job.estimate_id || `additionalwork:${aw.id}`;
  const buildId = job.build_id || '';
  const reservationIds: string[] = [];
  const taskIds: string[] = [];

  try {
    // 1. Reserve parts (idempotent: skip parts already reserved by this AW)
    const existingResRes = await base44.asServiceRole.entities.PartReservation.filter(
      { operation_id, status: { $in: ['reserved', 'partially_consumed', 'consumed'] } }, { limit: 500 }
    );
    const existingByPart: Record<string, any> = {};
    for (const r of (existingResRes.items || existingResRes || [])) {
      if (r.part_id) existingByPart[r.part_id] = r;
    }

    for (let i = 0; i < (aw.line_items || []).length; i++) {
      const li = aw.line_items[i];
      if (!li.part_id) continue;
      if (existingByPart[li.part_id]) {
        reservationIds.push(existingByPart[li.part_id].id);
        continue;
      }
      const partsRes = await base44.asServiceRole.entities.Part.filter({ id: li.part_id });
      const part = (partsRes.items || partsRes || [])[0];
      const onHand = part ? Number(part.quantity_on_hand) || 0 : 0;
      const required = Number(li.quantity) || 0;
      // Count reservations from OTHER sources (not this AW) as reserved-by-others.
      const allResRes = await base44.asServiceRole.entities.PartReservation.filter({
        part_id: li.part_id, status: { $in: ['reserved', 'partially_consumed'] },
      });
      let reservedByOthers = 0;
      for (const r of (allResRes.items || allResRes || [])) {
        if (r.operation_id && r.operation_id === operation_id) continue;
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

    // 2. Append to / create invoice (idempotent: dedup appended items by stable uid)
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

    const newLineItems = (aw.line_items || []).map((li: any, i: number) => ({
      ...li, engine_section: li.engine_section || 'Additional Work', aw_line_uid: `aw:${aw.id}:li:${i}`,
    }));
    const newLaborItems = [
      ...(aw.labor_items || []).map((l: any, i: number) => ({ ...l, engine_section: l.engine_section || 'Additional Work', aw_labor_uid: `aw:${aw.id}:lab:${i}` })),
      ...(aw.outsourced_services || []).map((s: any, i: number) => ({
        name: s.name, description: s.vendor ? `${s.vendor}${s.description ? ': ' + s.description : ''}` : (s.description || ''),
        price: s.price, engine_section: 'Additional Work', aw_labor_uid: `aw:${aw.id}:out:${i}`,
      })),
    ];
    const newMachiningItems = (aw.machining_items || []).map((m: any, i: number) => ({
      ...m, uid: `aw:${aw.id}:mach:${i}`, engine_section: m.engine_section || 'Additional Work',
    }));

    if (invoice) {
      // Dedup: drop any appended items that already exist (by stable uid).
      const existLineUids = new Set((invoice.line_items || []).map((x: any) => x.aw_line_uid).filter(Boolean));
      const existLaborUids = new Set((invoice.labor_items || []).map((x: any) => x.aw_labor_uid).filter(Boolean));
      const existMachUids = new Set((invoice.machining_items || []).map((x: any) => x.uid).filter(Boolean));
      const addLine = newLineItems.filter((x: any) => !existLineUids.has(x.aw_line_uid));
      const addLabor = newLaborItems.filter((x: any) => !existLaborUids.has(x.aw_labor_uid));
      const addMach = newMachiningItems.filter((x: any) => !existMachUids.has(x.uid));

      const line_items = [...(invoice.line_items || []), ...addLine];
      const labor_items = [...(invoice.labor_items || []), ...addLabor];
      const machining_items = [...(invoice.machining_items || []), ...addMach];
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
      const partsTotal = newLineItems.reduce((s: number, li: any) => s + (Number(li.total) || 0), 0);
      const laborTotal = newLaborItems.reduce((s: number, l: any) => s + (Number(l.price) || 0), 0);
      const machTotal = newMachiningItems.reduce((s: number, m: any) => s + (Number(m.price) || 0) * (Number(m.quantity) || 1), 0);
      const addedSubtotal = round2(partsTotal + laborTotal + machTotal);
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

    // 3. Build tasks per finding (idempotent: dedup by additional_work_id + name)
    if (buildId) {
      const existingTasksRes = await base44.asServiceRole.entities.BuildTask.filter(
        { build_id: buildId, additional_work_id: aw.id }, { limit: 500 }
      );
      const existingTaskNames = new Set((existingTasksRes.items || existingTasksRes || []).map((t: any) => t.name));
      for (const fid of (aw.finding_ids || [])) {
        const fRes = await base44.asServiceRole.entities.TeardownFinding.filter({ id: fid });
        const f = (fRes.items || fRes || [])[0];
        if (!f) continue;
        const name = `Additional: ${f.component} — ${(f.recommended_action || 'repair').replace(/_/g, ' ')}`;
        if (existingTaskNames.has(name)) continue;
        const task = await base44.asServiceRole.entities.BuildTask.create({
          build_id: buildId, template_name: 'Additional Work', name,
          stage: 'assembly', sort_order: 9999, status: 'pending', additional_work_id: aw.id,
        });
        taskIds.push(task.id);
      }
    }

    // 3b. Machining tasks (linked, deduped by source — existing logic)
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

    // --- Success: finalize (clear claim, mark processed) ---
    await base44.asServiceRole.entities.AdditionalWork.update(aw.id, {
      status: 'approved', approved_at: now, approved_by: actor, processed_at: now,
      processing_state: 'processed', processing_claim_token: '', processing_error: '',
      invoice_id: invoiceId, reservation_ids: reservationIds, task_ids: taskIds,
      version_history: appendVersion(aw, 'approved & processed', actor, aw.total),
    });

    try {
      await base44.asServiceRole.functions.invoke('syncMachiningTaskBilling', { job_id: job.id });
    } catch (e) { /* best-effort */ }

    return {
      ok: true, status: 'approved', invoice_id: invoiceId,
      reservations: reservationIds.length, tasks: taskIds.length,
      machining_tasks: machiningTaskIds.length,
    };
  } catch (error) {
    // --- Failure: record error, clear claim so a retry can re-claim and resume ---
    await base44.asServiceRole.entities.AdditionalWork.update(aw.id, {
      processing_state: 'failed', processing_error: error.message || 'Processing error', processing_claim_token: '',
    }).catch(() => {});
    return { ok: false, error: error.message || 'Processing error', recoverable: true };
  }
}