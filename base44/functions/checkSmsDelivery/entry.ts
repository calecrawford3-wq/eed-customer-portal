import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { voipMsCall } from "../../shared/voipMsApi.ts";

/*
 * Checks VoIP.ms carrier delivery status for outbound messages that have a
 * VoIP.ms SMS ID but no delivery confirmation yet. Updates the Message record
 * to status="delivered" with a delivered_at timestamp when the carrier reports
 * "Message delivered to handset."
 *
 * Input:  { messages: [{ id, voip_id }] }
 * Output: { updated: [internalId, ...], still_pending: [internalId, ...] }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (!messages.length) {
      return Response.json({ updated: [], still_pending: [] });
    }

    // Fetch recent outbound SMS from VoIP.ms to check carrier delivery status.
    const data = await voipMsCall("getSMS", {
      type: "outbound",
      limit: "100",
    });

    // Build map: VoIP.ms SMS ID → carrier_status
    const statusMap: Record<string, string> = {};
    if (data?.sms && Array.isArray(data.sms)) {
      for (const sms of data.sms) {
        statusMap[String(sms.id)] = String(sms.carrier_status || "");
      }
    }

    const updated: string[] = [];
    const stillPending: string[] = [];
    const now = new Date().toISOString();

    for (const msg of messages) {
      const voipId = String(msg.voip_id || "");
      const internalId = String(msg.id || "");
      if (!voipId || !internalId) continue;

      const carrierStatus = statusMap[voipId] || "";

      if (carrierStatus.toLowerCase().includes("delivered")) {
        await base44.asServiceRole.entities.Message.update(internalId, {
          status: "delivered",
          delivered_at: now,
        });
        updated.push(internalId);
      } else {
        stillPending.push(internalId);
      }
    }

    return Response.json({ updated, still_pending: stillPending });
  } catch (error) {
    console.error("checkSmsDelivery error:", error?.message || error);
    return Response.json(
      { error: error?.message || "Internal error" },
      { status: 500 }
    );
  }
});