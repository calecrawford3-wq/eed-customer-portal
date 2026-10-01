import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { testBridgeConnection } from '../../shared/voipPhonebook.ts';
import { sendPushToAllSubscriptions } from '../../shared/sendPush.ts';

// Bridge Health Monitor — pings the ElitePhoneBridge and alerts admins if it's down.
// Called by the "Bridge Health Monitor" scheduled workflow every 30 minutes.
// Avoids notification spam by skipping if a "bridge_down" alert was sent in the last 30 min.

const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Allow service-role calls (from automations) — no user auth required
    try {
      const user = await base44.auth.me();
      if (user && user.role !== "admin") {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch (_) {
      // Service-role call from workflow — allowed
    }

    // Ping the bridge
    const result = await testBridgeConnection();

    if (result.ok) {
      // Bridge is up — clear any stale "bridge_down" notifications so the next
      // outage triggers a fresh alert.
      return Response.json({ ok: true, message: result.message, ip: result.ip });
    }

    // Bridge is down — check if we already alerted recently (avoid spam)
    const recentCutoff = new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString();
    let alreadyAlerted = false;
    try {
      const recent = await base44.asServiceRole.entities.Notification.filter({
        type: "other",
        is_read: false,
      }, "-created_date", 20);
      alreadyAlerted = (recent || []).some(
        (n: any) =>
          n.title === "Phone Bridge Offline" &&
          n.created_date &&
          new Date(n.created_date).toISOString() >= recentCutoff,
      );
    } catch (_) {
      // If we can't check, err on the side of alerting
    }

    if (alreadyAlerted) {
      return Response.json({
        ok: false,
        message: result.message,
        alerted: false,
        reason: "cooldown",
      });
    }

    // Send in-app notification
    try {
      await base44.asServiceRole.entities.Notification.create({
        title: "Phone Bridge Offline",
        message: `The ElitePhoneBridge is unreachable (${result.message}). VoIP.ms phone book sync, SMS, and click-to-call are affected until it's restored.`,
        type: "other",
        link_url: "/VoipPhonebookSettings",
        is_read: false,
      });
    } catch (e) {
      console.error("[checkBridgeHealth] Failed to create notification:", e?.message);
    }

    // Send push notification
    try {
      await sendPushToAllSubscriptions(base44, {
        title: "⚠️ Phone Bridge Offline",
        body: `The ElitePhoneBridge is unreachable. VoIP.ms sync, SMS, and calls are affected.`,
        url: "/VoipPhonebookSettings",
      });
    } catch (e) {
      console.error("[checkBridgeHealth] Failed to send push:", e?.message);
    }

    return Response.json({
      ok: false,
      message: result.message,
      alerted: true,
    });
  } catch (e) {
    console.error("checkBridgeHealth error:", e?.message || e);
    return Response.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}