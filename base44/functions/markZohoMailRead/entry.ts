import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getZohoMailAccessToken, markMessagesReadStatus } from '../../shared/zohoMail.ts';

/**
 * Propagate read/unread state from the app to Zoho Mail — the outbound half of
 * bidirectional read sync. Admin-only.
 *
 * Body: { messages: [{ account_id, message_id }], read: boolean }
 * Groups messages by account_id and issues one Zoho updatemessage call per account.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const read = !!body?.read;
    if (!messages.length) return Response.json({ success: true, updated: 0 });

    const token = await getZohoMailAccessToken(base44);

    // Group message IDs by account
    const byAccount = {};
    for (const m of messages) {
      const acc = String(m?.account_id || '');
      const mid = String(m?.message_id || '');
      if (!acc || !mid) continue;
      if (!byAccount[acc]) byAccount[acc] = [];
      byAccount[acc].push(mid);
    }

    const errors = [];
    let updated = 0;
    for (const [accountId, ids] of Object.entries(byAccount)) {
      try {
        const res = await markMessagesReadStatus(token, accountId, ids, read);
        if (res?.ok) {
          updated += ids.length;
        } else {
          errors.push(`account ${accountId}: HTTP ${res?.status} ${JSON.stringify(res?.data || {}).slice(0, 200)}`);
        }
      } catch (e) {
        errors.push(`account ${accountId}: ${e.message || e}`);
      }
    }

    return Response.json({ success: errors.length === 0, updated, errors: errors.slice(0, 20) });
  } catch (error) {
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}