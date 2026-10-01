import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * Snoozes an exception alert with a reason and return date.
 * The underlying record is not changed — only the alert's display state.
 *
 * Input: { alert_id, snooze_reason, snooze_until }
 * Returns: the updated alert
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json();
    const { alert_id, snooze_reason, snooze_until } = body;

    if (!alert_id) return Response.json({ error: 'alert_id is required' }, { status: 400 });
    if (!snooze_until) return Response.json({ error: 'snooze_until date is required' }, { status: 400 });

    const updated = await base44.entities.ExceptionAlert.update(alert_id, {
      status: 'snoozed',
      snooze_reason: snooze_reason || '',
      snooze_until,
      snoozed_by: user.full_name || user.email || 'Admin',
    });

    return Response.json({ success: true, alert: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}