import { publicCapability } from '../../shared/publicCapability.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { applyApprovedAdditionalWork } from '../../shared/applyAdditionalWork.ts';

// Public (token-based) customer response to an additional-work approval.
// Sets customer_response (approved/declined) + customer_note and notifies
// the admin. When the shop has enabled auto_apply_customer_approvals
// (AppSettings, default OFF), a customer "approved" response triggers the
// privileged applyApprovedAdditionalWork core internally — so valid customer
// approval applies the approved scope automatically without a manual
// Approve & Apply step. The apply core is idempotent (processed_at guard) so
// historical approvals and retries are never reprocessed. Guest payment never
// reaches this path. The setting defaults OFF so existing approvals are not
// retroactively auto-processed.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { publicAccessToken, response, note } = body;
    if (!publicCapability(publicAccessToken)) return Response.json({ error: 'publicAccessToken is required' }, { status: 400 });
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

    // Gated auto-apply: when the shop has opted in (AppSettings flag, default
    // OFF), a customer "approved" response applies the approved scope
    // immediately via the same idempotent core the admin action uses. Default
    // OFF means historical approvals are never retroactively processed.
    let applied = false;
    let applyError = null;
    if (response === 'approved') {
      try {
        const settingsRes = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
        const settings = (settingsRes.items || settingsRes || [])[0] || {};
        if (settings.auto_apply_customer_approvals === true) {
          // Re-read the aw fresh so scope/version is current at apply time.
          const freshRes = await base44.asServiceRole.entities.AdditionalWork.filter({ id: aw.id });
          const freshAw = (freshRes.items || freshRes || [])[0] || aw;
          const result = await applyApprovedAdditionalWork(base44, freshAw, 'Automatic (customer approval)');
          applied = !!(result && result.ok);
          if (result && !result.ok) applyError = result.error;
        }
      } catch (e) {
        console.error('[respondPublicAdditionalWork] auto-apply failed:', e.message);
        applyError = e.message;
      }
    }

    return Response.json({ ok: true, customer_response: response, auto_applied: applied, auto_apply_error: applyError });
  } catch (error) {
    console.error('[respondPublicAdditionalWork] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
