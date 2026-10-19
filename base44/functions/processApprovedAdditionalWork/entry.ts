import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { applyApprovedAdditionalWork } from '../../shared/applyAdditionalWork.ts';

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

    // --- Approve & process (delegates to the shared, idempotent core) ---
    if (aw.status !== 'pending') return Response.json({ error: 'Only pending work can be approved' }, { status: 400 });
    if (aw.processed_at) return Response.json({ ok: true, already_processed: true, invoice_id: aw.invoice_id });

    const result = await applyApprovedAdditionalWork(base44, aw, actor);
    return Response.json(result, { status: result.ok ? 200 : 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function appendVersion(aw, reason, actor, total) {
  const hist = Array.isArray(aw.version_history) ? [...aw.version_history] : [];
  hist.push({ version: (aw.version || 1), changed_at: new Date().toISOString(), changed_by: actor, reason, total: Number(total) || 0 });
  return hist;
}