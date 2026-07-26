import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const DOC_TYPES = ['invoice', 'estimate', 'purchase_order', 'build'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { action = 'add', thread_id, account_id, entity_type, entity_id, entity_label, link_source = 'manual', confidence_score = 100 } = body;
    if (!thread_id || !account_id || !entity_type || !entity_id) return Response.json({ error: 'Missing thread_id/account_id/entity_type/entity_id' }, { status: 400 });

    const nowIso = new Date().toISOString();
    const byLabel = user.full_name || user.email || '';

    const existingActive = await base44.asServiceRole.entities.EmailThreadLink.filter(
      { thread_id, account_id, entity_type, entity_id, is_active: true }, '-created_date', 20
    );

    if (action === 'remove') {
      for (const l of (existingActive || [])) {
        await base44.asServiceRole.entities.EmailThreadLink.update(l.id, { is_active: false, removed_by: byLabel, removed_at: nowIso });
      }
      // Remove inherited per-message EmailLinks (keep manual direct links)
      const inherited = await base44.asServiceRole.entities.EmailLink.filter(
        { thread_id, account_id, entity_type, entity_id, link_source: 'auto' }, '-created_date', 1000
      );
      const affected = new Set();
      for (const l of (inherited || [])) {
        if (l.matched_by === 'thread_link' || l.matched_by === 'thread_inherit') {
          affected.add(l.email_id);
          try { await base44.asServiceRole.entities.EmailLink.delete(l.id); } catch (_) {}
        }
      }
      for (const eid of affected) {
        try { await recomputeEmail(base44, eid); } catch (_) {}
      }
      await recomputeThread(base44, account_id, thread_id);
      return Response.json({ ok: true, removed: (existingActive || []).length, recomputed: affected.size });
    }

    // action === add
    if (!(existingActive || []).length) {
      await base44.asServiceRole.entities.EmailThreadLink.create({
        thread_id, account_id, entity_type, entity_id,
        entity_label: entity_label || '', link_source, confidence_score,
        linked_by: byLabel, linked_at: nowIso, is_active: true,
      });
    } else {
      for (const l of existingActive) {
        if (l.linked_by !== byLabel) {
          await base44.asServiceRole.entities.EmailThreadLink.update(l.id, { linked_by: byLabel, linked_at: nowIso });
        }
      }
    }

    // Backfill: apply to all existing messages in the thread
    const emails = await base44.asServiceRole.entities.Email.filter({ thread_id, account_id }, '-received_at', 1000);
    const eUpdates = [];
    const newLinks = [];
    for (const e of (emails || [])) {
      const patch = applyLinkToEmail(e, entity_type, entity_id, entity_label || '');
      if (patch && Object.keys(patch).length) eUpdates.push({ id: e.id, ...patch });
      newLinks.push({
        email_id: e.id, thread_id, account_id, entity_type, entity_id,
        entity_label: entity_label || '', link_source: 'auto', matched_by: 'thread_link',
        confidence_score, match_status: 'confirmed',
      });
    }
    if (eUpdates.length) try { await base44.asServiceRole.entities.Email.bulkUpdate(eUpdates); } catch (_) {}
    if (newLinks.length) try { await base44.asServiceRole.entities.EmailLink.bulkCreate(newLinks); } catch (_) {}

    await recomputeThread(base44, account_id, thread_id);
    return Response.json({ ok: true, backfilled: eUpdates.length, links: newLinks.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function applyLinkToEmail(email, entity_type, entity_id, label) {
  const p = {};
  if (entity_type === 'customer') {
    if (!email.customer_id) { p.customer_id = entity_id; p.customer_name = label || ''; }
  } else if (entity_type === 'supplier') {
    if (!email.supplier_id) { p.supplier_id = entity_id; p.supplier_name = label || ''; }
  } else if (DOC_TYPES.includes(entity_type)) {
    if (!email.link_id) { p.link_type = entity_type; p.link_id = entity_id; p.link_number = label || ''; }
  }
  if (Object.keys(p).length) p.is_linked = true;
  return p;
}

async function recomputeEmail(base44, emailId) {
  const links = await base44.asServiceRole.entities.EmailLink.filter({ email_id: emailId }, '-created_date', 100);
  let customerId = '', customerName = '', supplierId = '', supplierName = '', linkType = 'none', linkId = '', linkNumber = '';
  for (const l of (links || [])) {
    if (l.entity_type === 'customer' && !customerId) { customerId = l.entity_id; customerName = l.entity_label || ''; }
    else if (l.entity_type === 'supplier' && !supplierId) { supplierId = l.entity_id; supplierName = l.entity_label || ''; }
    else if (DOC_TYPES.includes(l.entity_type) && linkType === 'none') { linkType = l.entity_type; linkId = l.entity_id; linkNumber = l.entity_label || ''; }
  }
  const isLinked = !!(linkId || customerId || supplierId);
  await base44.asServiceRole.entities.Email.update(emailId, {
    customer_id: customerId, customer_name: customerName,
    supplier_id: supplierId, supplier_name: supplierName,
    link_type: linkType, link_id: linkId, link_number: linkNumber, is_linked: isLinked,
  });
}

async function recomputeThread(base44, account_id, thread_id) {
  const activeLinks = await base44.asServiceRole.entities.EmailThreadLink.filter(
    { thread_id, account_id, is_active: true }, '-linked_at', 100
  );
  let customerId = '', customerName = '', supplierId = '', supplierName = '', linkType = 'none', linkNumber = '';
  for (const l of (activeLinks || [])) {
    if (l.entity_type === 'customer' && !customerId) { customerId = l.entity_id; customerName = l.entity_label || ''; }
    else if (l.entity_type === 'supplier' && !supplierId) { supplierId = l.entity_id; supplierName = l.entity_label || ''; }
    else if (DOC_TYPES.includes(l.entity_type) && linkType === 'none') { linkType = l.entity_type; linkNumber = l.entity_label || ''; }
  }
  const threads = await base44.asServiceRole.entities.EmailThread.filter({ account_id, thread_id }, '-last_message_at', 10);
  for (const t of (threads || [])) {
    try {
      await base44.asServiceRole.entities.EmailThread.update(t.id, {
        customer_id: customerId, customer_name: customerName,
        supplier_id: supplierId, supplier_name: supplierName,
        link_type: linkType, link_number: linkNumber,
      });
    } catch (_) {}
  }
}