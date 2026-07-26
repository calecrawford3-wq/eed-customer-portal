import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { thread_id, account_id } = await req.json().catch(() => ({}));
    if (!thread_id || !account_id) return Response.json({ error: 'Missing thread_id/account_id' }, { status: 400 });

    // Already-active thread links — never suggested again
    const active = await base44.asServiceRole.entities.EmailThreadLink.filter({ thread_id, account_id, is_active: true }, '-linked_at', 100);
    const linkedKeys = new Set((active || []).map((l) => `${l.entity_type}|${l.entity_id}`));

    // Dismissed suggestions on the thread record
    const threads = await base44.asServiceRole.entities.EmailThread.filter({ account_id, thread_id }, '-last_message_at', 5);
    let dismissed = [];
    try { dismissed = threads && threads[0]?.dismissed_link_suggestions ? JSON.parse(threads[0].dismissed_link_suggestions) : []; } catch (_) { dismissed = []; }
    const dismissedKeys = new Set((dismissed || []).map((k) => String(k)));

    // Build a haystack from the thread's message subjects + bodies
    const emails = await base44.asServiceRole.entities.Email.filter({ thread_id, account_id }, '-received_at', 200);
    const haystack = ((emails || []).map((e) => `${e.subject || ''}\n${e.body_text || ''}\n${e.preview || ''}`).join('\n') || '').toLowerCase();
    if (!haystack) return Response.json({ suggestions: [] });

    const suggestions = [];
    const seen = new Set();
    const add = (entity_type, list, field, labelFn) => {
      for (const d of (list || [])) {
        const num = String(d[field] || '').trim();
        if (num.length < 3) continue;
        if (!haystack.includes(num.toLowerCase())) continue;
        const key = `${entity_type}|${d.id}`;
        if (linkedKeys.has(key) || dismissedKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        suggestions.push({ key, entity_type, entity_id: d.id, entity_label: labelFn ? labelFn(d) : num, matched_number: num });
        if (suggestions.length >= 8) return;
      }
    };

    const [invoices, estimates, pos, builds] = await Promise.all([
      base44.asServiceRole.entities.Invoice.list('-created_date', 500),
      base44.asServiceRole.entities.Estimate.list('-created_date', 500),
      base44.asServiceRole.entities.PurchaseOrder.list('-created_date', 500),
      base44.asServiceRole.entities.EngineBuild.list('-created_date', 500),
    ]);
    add('invoice', invoices, 'invoice_number');
    add('estimate', estimates, 'estimate_number');
    add('purchase_order', pos, 'po_number');
    add('build', builds, 'engine_serial_number', (b) => b.eed_id || b.engine_serial_number);
    add('build', builds, 'build_number', (b) => b.build_number);

    return Response.json({ suggestions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}