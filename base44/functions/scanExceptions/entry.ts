import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * Scans all shop data and creates/resolves ExceptionAlert records.
 * Each exception type is detected from live data; alerts are deduplicated by exception_key.
 * Snoozed alerts are preserved (unless the snooze expired). Resolved alerts are auto-closed
 * when the underlying issue is no longer detected.
 *
 * Admin only. Returns a summary of created/resolved counts.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Load all data needed for exception detection
    const [jobsRes, estimatesRes, invoicesRes, enginesRes, buildsRes, posRes, additionalWorkRes, tasksRes, reservationsRes, settingsRes, packingSlipsRes] = await Promise.all([
      base44.entities.Job.filter({ archived: { $ne: true } }, { limit: 500, sort: '-created_date' }),
      base44.entities.Estimate.filter({ archived: { $ne: true } }, { limit: 500 }),
      base44.entities.Invoice.filter({ status: { $in: ['draft', 'sent', 'partial', 'overdue'] } }, { limit: 500 }),
      base44.entities.CustomerEngine.filter({ status: { $ne: 'inactive' } }, { limit: 500 }),
      base44.entities.EngineBuild.filter({ status: { $nin: ['complete', 'shipped'] } }, { limit: 500 }),
      base44.entities.PurchaseOrder.filter({ status: { $in: ['sent', 'acknowledged', 'partial', 'ready'] } }, { limit: 500 }),
      base44.entities.AdditionalWork.filter({ status: 'pending' }, { limit: 500 }),
      base44.entities.BuildTask.filter({ status: { $in: ['pending', 'in_progress'] } }, { limit: 1000 }),
      base44.entities.PartReservation.filter({ status: { $in: ['reserved', 'partially_consumed'] } }, { limit: 500 }),
      base44.entities.AppSettings.filter({ key: 'global' }),
      base44.entities.PackingSlip.filter({ status: 'pending_review' }, { limit: 100 }),
    ]);

    const jobs = jobsRes.items || jobsRes;
    const estimates = estimatesRes.items || estimatesRes;
    const invoices = invoicesRes.items || invoicesRes;
    const engines = enginesRes.items || enginesRes;
    const builds = buildsRes.items || buildsRes;
    const purchaseOrders = posRes.items || posRes;
    const additionalWorks = additionalWorkRes.items || additionalWorkRes;
    const tasks = tasksRes.items || tasksRes;
    const reservations = reservationsRes.items || reservationsRes;
    const settings = (settingsRes.items || settingsRes)[0];
    const packingSlips = packingSlipsRes.items || packingSlipsRes;

    const stalledThresholdDays = settings?.stalled_job_threshold_days || 14;
    const stalledThreshold = new Date(now.getTime() - stalledThresholdDays * 24 * 60 * 60 * 1000);

    // Helper: load all customers for name resolution
    const customersRes = await base44.entities.Customer.filter({ status: 'active' }, { limit: 500, fields: ['id', 'first_name', 'last_name', 'company_name'] });
    const customers = customersRes.items || customersRes;
    const customerMap = new Map(customers.map(c => [c.id, c]));

    // Build the set of current exception keys
    const currentExceptions = [];

    // 1. Checked-in engines without estimates
    for (const engine of engines) {
      const hasEstimate = estimates.some(e => e.customer_engine_id === engine.id);
      if (!hasEstimate) {
        const customer = customerMap.get(engine.customer_id);
        currentExceptions.push({
          exception_type: 'engine_without_estimate',
          exception_key: `engine_without_estimate:${engine.id}`,
          customer_id: engine.customer_id,
          customer_name: customer ? `${customer.first_name} ${customer.last_name}` : '',
          title: `Engine ${engine.eed_id || engine.engine_serial_number} has no estimate`,
          description: `Checked-in engine ${engine.eed_id || ''} (${engine.engine_serial_number || ''}) has no linked estimate. Create an estimate to start the job process.`,
          severity: 'info',
          job_card_section: 'overview',
          metadata: JSON.stringify({ engine_id: engine.id, eed_id: engine.eed_id }),
        });
      }
    }

    // 2. Approved jobs awaiting engine arrival or required deposits
    for (const job of jobs) {
      if (job.stage === 'awaiting_approval' && job.is_active) {
        const customer = customerMap.get(job.customer_id);
        currentExceptions.push({
          exception_type: 'job_awaiting_engine',
          exception_key: `job_awaiting_engine:${job.id}`,
          job_id: job.id,
          job_number: job.job_number,
          customer_id: job.customer_id,
          customer_name: customer ? `${customer.first_name} ${customer.last_name}` : '',
          title: `Job ${job.job_number} awaiting engine arrival`,
          description: `Job ${job.job_number} is approved but has no engine checked in yet. Confirm the engine has arrived and link it to the job.`,
          severity: 'warning',
          job_card_section: 'overview',
        });
      }
      if (job.deposit_required && !job.deposit_met && job.stage === 'awaiting_deposit') {
        const customer = customerMap.get(job.customer_id);
        currentExceptions.push({
          exception_type: 'job_awaiting_deposit',
          exception_key: `job_awaiting_deposit:${job.id}`,
          job_id: job.id,
          job_number: job.job_number,
          customer_id: job.customer_id,
          customer_name: customer ? `${customer.first_name} ${customer.last_name}` : '',
          title: `Job ${job.job_number} awaiting deposit`,
          description: `Job ${job.job_number} requires a deposit of $${(job.deposit_amount || 0).toFixed(2)} before activation. Record the deposit to start the build.`,
          severity: 'warning',
          job_card_section: 'overview',
          metadata: JSON.stringify({ deposit_amount: job.deposit_amount }),
        });
      }
    }

    // 3. Additional-work approvals awaiting a response
    for (const aw of additionalWorks) {
      const job = jobs.find(j => j.id === aw.job_id);
      const customer = customerMap.get(aw.customer_id || job?.customer_id);
      currentExceptions.push({
        exception_type: 'additional_work_pending',
        exception_key: `additional_work_pending:${aw.id}`,
        job_id: aw.job_id,
        job_number: job?.job_number || '',
        customer_id: aw.customer_id || job?.customer_id,
        customer_name: customer ? `${customer.first_name} ${customer.last_name}` : '',
        title: `Additional work ${aw.work_number} awaiting customer response`,
        description: `Additional work request ${aw.work_number} (${aw.title || ''}) for job ${job?.job_number || ''} is pending customer approval. Total: $${(aw.total || 0).toFixed(2)}`,
        severity: 'warning',
        job_card_section: 'findings',
        metadata: JSON.stringify({ additional_work_id: aw.id, total: aw.total }),
      });
    }

    // 4. Parts overdue against expected delivery dates
    for (const po of purchaseOrders) {
      if (po.expected_delivery_date && po.expected_delivery_date < todayStr && po.status !== 'received') {
        const jobIds = (po.line_items || []).map(li => li.job_id).filter(Boolean);
        const jobId = jobIds[0] || '';
        const job = jobs.find(j => j.id === jobId);
        const customer = customerMap.get(job?.customer_id);
        currentExceptions.push({
          exception_type: 'parts_overdue',
          exception_key: `parts_overdue:${po.id}`,
          job_id: jobId,
          job_number: job?.job_number || '',
          customer_id: job?.customer_id,
          customer_name: customer ? `${customer.first_name} ${customer.last_name}` : '',
          title: `PO ${po.po_number} overdue (expected ${po.expected_delivery_date})`,
          description: `Purchase order ${po.po_number} was expected by ${po.expected_delivery_date} and has not been fully received. Follow up with the supplier.`,
          severity: 'warning',
          job_card_section: 'parts',
          metadata: JSON.stringify({ po_id: po.id, po_number: po.po_number, expected_date: po.expected_delivery_date }),
        });
      }
    }

    // 5. Jobs stalled beyond configurable threshold
    for (const job of jobs) {
      if (!job.is_active || job.stage === 'picked_up') continue;
      const lastActivity = job.updated_date || job.created_date;
      if (lastActivity && new Date(lastActivity) < stalledThreshold) {
        const customer = customerMap.get(job.customer_id);
        currentExceptions.push({
          exception_type: 'job_stalled',
          exception_key: `job_stalled:${job.id}`,
          job_id: job.id,
          job_number: job.job_number,
          customer_id: job.customer_id,
          customer_name: customer ? `${customer.first_name} ${customer.last_name}` : '',
          title: `Job ${job.job_number} stalled (${stalledThresholdDays}+ days)`,
          description: `Job ${job.job_number} has been in stage "${job.stage}" for over ${stalledThresholdDays} days without a stage change. Review and update the job status.`,
          severity: 'warning',
          job_card_section: 'workflow',
          metadata: JSON.stringify({ stage: job.stage, last_activity: lastActivity }),
        });
      }
    }

    // 6. Missing required measurements or QC tasks
    const buildIds = new Set(builds.map(b => b.id));
    for (const task of tasks) {
      if (task.is_required && task.status !== 'complete' && task.status !== 'skipped' && buildIds.has(task.build_id)) {
        const build = builds.find(b => b.id === task.build_id);
        const job = jobs.find(j => j.build_id === task.build_id);
        const customer = customerMap.get(job?.customer_id);
        currentExceptions.push({
          exception_type: 'missing_qc_tasks',
          exception_key: `missing_qc_tasks:${task.id}`,
          job_id: job?.id,
          job_number: job?.job_number || '',
          customer_id: job?.customer_id,
          customer_name: customer ? `${customer.first_name} ${customer.last_name}` : '',
          title: `Required task incomplete: ${task.name}`,
          description: `Required QC task "${task.name}" in stage "${task.stage}" is ${task.status === 'in_progress' ? 'in progress' : 'not started'} on build ${build?.build_number || ''}. Complete or skip this task before build completion.`,
          severity: 'warning',
          job_card_section: 'workflow',
          metadata: JSON.stringify({ task_id: task.id, build_id: task.build_id }),
        });
      }
    }

    // 7. Approved extra work not reflected in the invoice
    for (const aw of additionalWorks) {
      // Already pending ones are caught above; check approved but not processed
      if (aw.status === 'approved' && !aw.processed_at) {
        const job = jobs.find(j => j.id === aw.job_id);
        const customer = customerMap.get(aw.customer_id || job?.customer_id);
        currentExceptions.push({
          exception_type: 'approved_work_not_invoiced',
          exception_key: `approved_work_not_invoiced:${aw.id}`,
          job_id: aw.job_id,
          job_number: job?.job_number || '',
          customer_id: aw.customer_id || job?.customer_id,
          customer_name: customer ? `${customer.first_name} ${customer.last_name}` : '',
          title: `Approved work ${aw.work_number} not yet invoiced`,
          description: `Additional work ${aw.work_number} (${aw.title || ''}) was approved but has not been processed into the invoice. Process it to update the final invoice.`,
          severity: 'critical',
          job_card_section: 'invoices',
          metadata: JSON.stringify({ additional_work_id: aw.id }),
        });
      }
    }

    // 8. Completed jobs with missing or unsent final invoices
    for (const job of jobs) {
      if (job.stage === 'ready_for_pickup' || (job.completed_at && !job.archived)) {
        const jobInvoices = invoices.filter(inv => (job.invoice_ids || []).includes(inv.id) || inv.estimate_id === job.estimate_id);
        if (jobInvoices.length === 0) {
          const customer = customerMap.get(job.customer_id);
          currentExceptions.push({
            exception_type: 'completed_job_no_invoice',
            exception_key: `completed_job_no_invoice:${job.id}`,
            job_id: job.id,
            job_number: job.job_number,
            customer_id: job.customer_id,
            customer_name: customer ? `${customer.first_name} ${customer.last_name}` : '',
            title: `Job ${job.job_number} completed without a final invoice`,
            description: `Job ${job.job_number} is complete but has no final invoice. Create and send the invoice to the customer.`,
            severity: 'critical',
            job_card_section: 'invoices',
          });
        }
      }
    }

    // 9. Picked-up/shipped engines with unpaid balances
    for (const job of jobs) {
      if (job.stage === 'picked_up') {
        const jobInvoices = invoices.filter(inv => (job.invoice_ids || []).includes(inv.id) || inv.estimate_id === job.estimate_id);
        for (const inv of jobInvoices) {
          if ((inv.balance_due || 0) > 0) {
            const customer = customerMap.get(job.customer_id);
            currentExceptions.push({
              exception_type: 'picked_up_unpaid',
              exception_key: `picked_up_unpaid:${inv.id}`,
              job_id: job.id,
              job_number: job.job_number,
              customer_id: job.customer_id,
              customer_name: customer ? `${customer.first_name} ${customer.last_name}` : '',
              title: `Job ${job.job_number} picked up with unpaid balance`,
              description: `Engine for job ${job.job_number} was picked up but invoice ${inv.invoice_number} still has a balance of $${(inv.balance_due || 0).toFixed(2)}. Follow up for payment.`,
              severity: 'critical',
              job_card_section: 'invoices',
              metadata: JSON.stringify({ invoice_id: inv.id, invoice_number: inv.invoice_number, balance: inv.balance_due }),
            });
          }
        }
      }
    }

    // 10. Failed or incomplete inventory/payment operations — packing slips pending review
    for (const ps of packingSlips) {
      currentExceptions.push({
        exception_type: 'failed_operation',
        exception_key: `packing_slip_pending:${ps.id}`,
        title: `Packing slip pending review`,
        description: `A packing slip (${ps.file_name || 'uploaded document'}) has been extracted and is awaiting admin confirmation before posting to inventory.`,
        severity: 'info',
        job_card_section: 'parts',
        metadata: JSON.stringify({ packing_slip_id: ps.id, po_id: ps.po_id }),
      });
    }

    // Load existing alerts
    const existingAlertsRes = await base44.entities.ExceptionAlert.filter({ status: { $in: ['active', 'snoozed'] } }, { limit: 1000 });
    const existingAlerts = existingAlertsRes.items || existingAlertsRes;
    const existingMap = new Map(existingAlerts.map(a => [a.exception_key, a]));

    const currentKeys = new Set(currentExceptions.map(e => e.exception_key));
    let created = 0;
    let resolved = 0;
    let reactivated = 0;

    // Create new alerts for exceptions not yet tracked
    for (const exc of currentExceptions) {
      const existing = existingMap.get(exc.exception_key);
      if (!existing) {
        await base44.entities.ExceptionAlert.create({
          ...exc,
          status: 'active',
        });
        created++;
      } else if (existing.status === 'snoozed') {
        // Check if snooze expired
        if (existing.snooze_until && existing.snooze_until < todayStr) {
          await base44.entities.ExceptionAlert.update(existing.id, { status: 'active', snooze_reason: '', snooze_until: '' });
          reactivated++;
        }
      }
      // If already active, no action needed (dedup)
    }

    // Resolve alerts whose underlying issue is fixed
    for (const alert of existingAlerts) {
      if (alert.status === 'snoozed') continue; // Don't auto-resolve snoozed alerts
      if (!currentKeys.has(alert.exception_key)) {
        await base44.entities.ExceptionAlert.update(alert.id, { status: 'resolved', resolved_at: now.toISOString() });
        resolved++;
      }
    }

    return Response.json({
      success: true,
      summary: {
        total_current: currentExceptions.length,
        created,
        resolved,
        reactivated,
        still_active: existingAlerts.filter(a => a.status === 'active').length + created - resolved,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}