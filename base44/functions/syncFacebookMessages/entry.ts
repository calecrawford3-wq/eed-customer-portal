import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  getPageInfo,
  getAppUserAccessToken,
  listFacebookPages,
  getCachedPageToken,
  debugFacebookAccess,
} from '../../shared/facebookPages.ts';

const GRAPH_API_VERSION = "v25.0";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    // Allow both admin users (manual sync) and scheduled automations (no user context)
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { page_id, list_pages_only } = body;

    if (list_pages_only) {
      // Try app-user connection to list available Pages (for the page selector)
      try {
        const userToken = await getAppUserAccessToken(base44);
        const pages = await listFacebookPages(userToken);
        const debug = body.debug ? await debugFacebookAccess(userToken) : undefined;
        return Response.json({
          pages: pages.map((p) => ({ id: p.id, name: p.name })),
          connected: true,
          ...(debug ? { _debug: debug } : {}),
        });
      } catch {
        // No app-user connection — return cached page info if available
        const cached = await getCachedPageToken(base44);
        return Response.json({
          pages: cached ? [{ id: cached.pageId, name: cached.pageName }] : [],
          connected: false,
        });
      }
    }

    // Full sync — getPageInfo tries cached token first, then app-user exchange
    const pageInfo = await getPageInfo(base44, page_id);
    const pageToken = pageInfo.pageAccessToken;

    // Fetch conversations
    const convUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageInfo.pageId}/conversations?fields=id,updated_time,link,participants&limit=50`;
    const convResp = await fetch(convUrl, { headers: { Authorization: `Bearer ${pageToken}` } });
    const convData = await convResp.json();
    if (convData.error) throw new Error(convData.error.message);

    const conversations = convData.data || [];

    // Get last sync checkpoint for incremental sync
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
    const settingsRec = settings?.[0];
    const lastSync = settingsRec?.facebook_last_sync || null;

    let newMessageCount = 0;
    let skippedByCheckpoint = 0;

    for (const conv of conversations) {
      // Skip conversations not updated since last sync
      if (lastSync && conv.updated_time) {
        if (new Date(conv.updated_time) <= new Date(lastSync)) {
          skippedByCheckpoint++;
          continue;
        }
      }

      // Fetch messages for this conversation (most recent first)
      const msgUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${conv.id}/messages?fields=id,message,from,created_time&limit=50`;
      const msgResp = await fetch(msgUrl, { headers: { Authorization: `Bearer ${pageToken}` } });
      const msgData = await msgResp.json();
      if (msgData.error) continue;

      const messages = msgData.data || [];

      for (const m of messages) {
        // Check if we already have this message (dedup by message_id + channel)
        const existing = await base44.asServiceRole.entities.Message.filter(
          { message_id: m.id, channel: "facebook" },
          "-created_date",
          1
        );
        if (existing && existing.length > 0) continue;

        const senderId = m.from?.id || "";
        const senderName = m.from?.name || "Facebook User";
        const direction = senderId === pageInfo.pageId ? "outbound" : "inbound";

        await base44.asServiceRole.entities.Message.create({
          phone_number: senderId,
          direction,
          from_number: senderId,
          to_number: pageInfo.pageId,
          body: m.message || "",
          message_id: m.id,
          status: "received",
          is_read: direction === "outbound" ? true : false,
          channel: "facebook",
          sent_at: m.created_time,
          customer_name: direction === "inbound" ? senderName : null,
        });
        newMessageCount++;
      }
    }

    // Update last sync time and page info
    if (settingsRec) {
      await base44.asServiceRole.entities.AppSettings.update(settingsRec.id, {
        facebook_last_sync: new Date().toISOString(),
        facebook_page_id: pageInfo.pageId,
        facebook_page_name: pageInfo.pageName,
      });
    }

    return Response.json({
      selectedPage: { id: pageInfo.pageId, name: pageInfo.pageName },
      newMessages: newMessageCount,
      conversationsSkipped: skippedByCheckpoint,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}