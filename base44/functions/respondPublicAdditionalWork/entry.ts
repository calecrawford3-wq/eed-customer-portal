import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Public (token-based) customer response to an additional-work approval.
// Sets customer_response (approved/declined) + customer_note and notifies
// the admin. Does NOT mutate the invoice — the shop still applies the work
// via the admin "Approve & Apply" action. Idempotent: re-responding updates
// the note/timestamp.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { publicAccessToken, response, note } = body;
    if (!publicAccessToken) return Response.json({ error: 'publicAccessToken is required' }, { status: 400 });
    if (!['approved', 'declined'].includes(response)) {
      return Response.json({ error: 'response must be approved or declined' }, { status: 400 });
    }

    const awRes = await base44.asServiceRole.entities.AdditionalWork.filter({ public_access_token: publicAccessToken });
    const aw = (awRes.items || awRes || [])[0];
    if (!aw) return Response.json({ error: 'Approval not found' }, { status: 404 });
    if (aw.status === 'approved' || aw.processed_at) {
      return Response.json({ error: 'This approval has already been processed by the shop' }, { status: 400 });
    }
    if (aw.status === 'canceled') {
      return Response.json({ error: 'This approval has been withdrawn' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.AdditionalWork.update(aw.id, {
      customer_response: response,
      customer_response_at: now,
      customer_note: note || '',
    });

    // Notify admin
    try {
      await base44.asServiceRole.functions.invoke('sendAdminNotification', {
        title: `Additional Work ${response === 'approved' ? 'Approved' : 'Declined'} by Customer`,
        message: `${aw.work_number || ''} (${aw.title || 'Additional work'}) — customer responded "${response}" via the approval link.${note ? ` Note: "${note}"` : ''}`,
        type: 'other',
        link_url: `/JobCard?id=${aw.job_id}`,
      });
    } catch (e) {
      console.error('[respondPublicAdditionalWork] admin notify failed:', e.message);
    }

    return Response.json({ ok: true, customer_response: response });
  } catch (error) {
    console.error('[respondPublicAdditionalWork] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}