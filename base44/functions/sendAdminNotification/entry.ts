import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { sendPushToAllSubscriptions } from "../../shared/sendPush.ts";

const ADMIN_EMAIL = "admin@eedpower.com";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let body;
    try {
      body = await req.json();
    } catch (_e) {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Support entity-automation payloads: { event: {type, entity_name, entity_id}, data: {...} }
    if (body?.event?.entity_name === "RefreshRequest" && body?.data) {
      const r = body.data;
      body = {
        title: "Engine Refresh Request",
        message: `${r.customer_name || "A customer"} requested a refresh for engine ${r.build_serial || ""}.${r.message ? ` Message: "${r.message}"` : ""}`,
        type: "refresh_request",
        link_url: "/RefreshRequests",
      };
    }

    const { title, message, type, link_url } = body;

    if (!title || !message) {
      return Response.json({ error: "title and message are required" }, { status: 400 });
    }

    const notifType = type || "other";

    // Fetch global settings once — used for both in-app and push toggle checks
    let globalSettings = null;
    try {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
      globalSettings = settings?.[0] || null;
    } catch (e) {
      console.error("[sendAdminNotification] Failed to fetch settings:", e.message);
    }

    // Check in-app notification preference — skip entirely if disabled
    const inAppKey = `notif_${notifType}`;
    if (inAppKey !== "notif_other" && globalSettings && inAppKey in globalSettings && globalSettings[inAppKey] === false) {
      return Response.json({ success: true, skipped: "notification type disabled" });
    }

    // 1. Persist a Notification record (service role — works from any caller)
    try {
      await base44.asServiceRole.entities.Notification.create({
        title,
        message,
        type: type || "other",
        link_url: link_url || "",
        is_read: false,
      });
    } catch (e) {
      console.error("[sendAdminNotification] Failed to create notification record:", e.message);
    }

    // 2. Email the admin
    const subject = `[EED Notification] ${title}`;
    const bodyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">${title}</h2>
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">${message}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">Elite Engine Development — automated notification</p>
      </div>
    `;
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: ADMIN_EMAIL,
        subject,
        body: bodyHtml,
        from_name: "EED Notifications",
      });
    } catch (e) {
      console.error("[sendAdminNotification] Failed to send email:", e.message);
    }

    // 3. Send push notification — check push-specific toggle
    const pushKey = `notif_push_${notifType}`;
    const pushEnabled = !globalSettings || !(pushKey in globalSettings) || globalSettings[pushKey] !== false;
    if (pushEnabled) {
      try {
        await sendPushToAllSubscriptions(base44, {
          title,
          body: message,
          url: link_url || "/Dashboard",
        });
      } catch (e) {
        console.error("[sendAdminNotification] Push failed:", e.message);
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[sendAdminNotification] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});