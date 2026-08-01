import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getPageInfo } from '../../shared/facebookPages.ts';

const GRAPH_API_VERSION = "v25.0";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { recipient_psid, message, page_id } = body;
    if (!recipient_psid || !message) {
      return Response.json({ error: 'recipient_psid and message are required' }, { status: 400 });
    }

    const pageInfo = await getPageInfo(base44, page_id);

    // Send via Send API
    const sendResp = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageInfo.pageId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pageInfo.pageAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          recipient: { id: recipient_psid },
          message: { text: message },
          messaging_type: "RESPONSE"
        })
      }
    );
    const sendData = await sendResp.json();
    if (sendData.error) throw new Error(sendData.error.message);

    const fbMessageId = sendData.message_id;

    // Store sent message
    const created = await base44.asServiceRole.entities.Message.create({
      phone_number: recipient_psid,
      direction: "outbound",
      from_number: pageInfo.pageId,
      to_number: recipient_psid,
      body: message,
      message_id: fbMessageId,
      status: "sent",
      is_read: true,
      channel: "facebook",
      sent_at: new Date().toISOString()
    });

    return Response.json({ success: true, message_id: fbMessageId, record_id: created.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}