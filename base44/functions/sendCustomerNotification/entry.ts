import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { voipMsCall, VoipMsError } from "../../shared/voipMsApi.ts";

// Unified customer notification workflow — sends email and SMS in one call,
// tracks delivery status per channel, prevents duplicates via idempotency_key,
// and retries only failed channels on re-invocation.
//
// POST {
//   event_type: "estimate_ready" | "additional_work_ready" | "stage_change" | "completion",
//   idempotency_key: string,            // event_type + ":" + entity_id (deterministic)
//   customer_id: string,
//   channels: ["email","sms"],          // which channels to attempt
//   subject: string,                    // email subject
//   email_body: string,                 // HTML email body
//   sms_body: string,                   // plain-text SMS body (<=160 chars recommended)
//   link_url?: string,                  // document/approval link
//   job_id?: string,
//   entity_id?: string,
//   entity_label?: string,
// }
// Returns { id, email_status, sms_status, email_error, sms_error, idempotent }

function normalizeNanpaNumber(value) {
  if (!value) return "";
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 10) digits = `1${digits}`;
  return digits;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin")
      return Response.json({ error: "Admin required" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const {
      event_type,
      idempotency_key,
      customer_id,
      channels = [],
      subject,
      email_body,
      sms_body,
      link_url,
      job_id,
      entity_id,
      entity_label,
    } = body;

    const preferences = { estimate_ready: 'notif_customer_estimate_ready', additional_work_ready: 'notif_customer_additional_work', stage_change: 'notif_customer_stage_change', completion: 'notif_customer_completion' };
    if (!Object.hasOwn(preferences, event_type)) return Response.json({ error: 'Unsupported notification event' }, { status: 400 });
    if (!Array.isArray(channels) || channels.some(c => !['email', 'sms'].includes(c))) return Response.json({ error: 'Invalid notification channels' }, { status: 400 });
    if (typeof idempotency_key !== 'string' || idempotency_key !== `${event_type}:${entity_id || customer_id}`) return Response.json({ error: 'Invalid event identity' }, { status: 400 });
    if (!event_type || !idempotency_key || !customer_id) {
      return Response.json(
        { error: "event_type, idempotency_key, and customer_id are required" },
        { status: 400 }
      );
    }

    // Resolve customer
    let customer = null;
    try {
      const custRes = await base44.asServiceRole.entities.Customer.filter({
        id: customer_id,
      });
      customer = (custRes.items || custRes || [])[0];
    } catch (lookupErr) {
      return Response.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }
    if (!customer)
      return Response.json({ error: "Customer not found" }, { status: 404 });

    // Resolve settings for email signature
    const settingsRes = await base44.asServiceRole.entities.AppSettings.filter({
      key: "global",
    });
    const settings = (settingsRes.items || settingsRes || [])[0] || {};
    const companyName = settings.company_name || "Elite Engine Development";
    if (settings[preferences[event_type]] === 'off') return Response.json({ skipped: true, reason: 'Notification disabled in Settings' });

    // Check for existing notification (idempotency)
    const existingRes =
      await base44.asServiceRole.entities.CustomerNotification.filter({
        idempotency_key,
      });
    const existing = (existingRes.items || existingRes || [])[0];

    // Determine which channels to attempt
    const wantEmail =
      channels.includes("email") && !!customer.email;
    const wantSms =
      channels.includes("sms") &&
      !!customer.phone &&
      !customer.sms_opt_out;

    // If we have an existing record, check which channels still need sending
    let emailStatus = wantEmail ? "pending" : "skipped";
    let emailError = "";
    let smsStatus = wantSms ? "pending" : "skipped";
    let smsError = "";
    let smsMessageId = "";

    if (existing) {
      emailStatus = existing.email_status;
      emailError = existing.email_error || "";
      smsStatus = existing.sms_status;
      smsError = existing.sms_error || "";
      smsMessageId = existing.sms_message_id || "";

      // Only retry channels that are in a failed/pending state AND are still wanted
      const emailNeedsRetry =
        wantEmail && !["sent", "skipped"].includes(emailStatus);
      const smsNeedsRetry =
        wantSms && !["sent", "skipped", "unknown"].includes(smsStatus);

      if (!emailNeedsRetry && !smsNeedsRetry) {
        // Both channels are done — return idempotent result
        return Response.json({ ...existing, idempotent: true });
      }
    }

    // ─── Send Email ───
    if (wantEmail && !["sent", "skipped"].includes(emailStatus)) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: customer.email,
          subject: subject || `${companyName} — Update`,
          body: email_body || sms_body || "",
          text: sms_body || subject || "",
        });
        emailStatus = "sent";
        emailError = "";
      } catch (e) {
        emailStatus = "failed";
        emailError = e?.message || "Email send failed";
      }
    } else if (!wantEmail) {
      emailStatus = "skipped";
    }

    // ─── Send SMS ───
    if (wantSms && !["sent", "skipped", "unknown"].includes(smsStatus)) {
      const canonicalTo = normalizeNanpaNumber(customer.phone);
      const canonicalFrom = normalizeNanpaNumber(
        Deno.env.get("VOIP_MS_FROM_NUMBER")
      );

      if (
        canonicalTo.length !== 11 ||
        !canonicalTo.startsWith("1") ||
        canonicalFrom.length !== 11
      ) {
        smsStatus = "failed";
        smsError = "Invalid phone number for SMS";
      } else {
        const apiTo = canonicalTo.slice(1);
        const apiFrom = canonicalFrom.slice(1);
        const message = String(sms_body || subject || "").trim();
        const isMms = message.length > 160;
        const method = isMms ? "sendMMS" : "sendSMS";

        const voipParams = {
          did: apiFrom,
          dst: apiTo,
          message,
        };

        const MAX_ATTEMPTS = 3;
        let data = null;
        let confirmationId = "";
        let failReason = "";

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          try {
            data = await voipMsCall(method, voipParams);
            if (data && data.status === "success") {
              confirmationId = String(
                data.sms || data.sms_id || data.message_id || data.id || ""
              );
              smsStatus = "sent";
              break;
            }
            smsStatus = "failed";
            failReason =
              data?.message ||
              `VoIP.ms ${method} returned status: ${data?.status || "unknown"}`;
            break;
          } catch (bridgeError) {
            const isHardError =
              bridgeError instanceof VoipMsError &&
              (bridgeError.permanent ||
                bridgeError.voipmsStatus === "invalid_phonebook");

            if (isHardError) {
              smsStatus = "failed";
              failReason =
                bridgeError?.message || `VoIP.ms ${method} call failed`;
              break;
            }

            if (attempt < MAX_ATTEMPTS - 1) {
              const delay = 1000 * Math.pow(2, attempt);
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }

            smsStatus = "unknown";
            failReason = bridgeError?.message || "VoIP.ms API timeout";
          }
        }

        smsError = smsStatus !== "sent" ? failReason : "";

        // Create Message record for SMS history
        if (smsStatus === "sent" || smsStatus === "unknown") {
          try {
            const now = new Date().toISOString();
            const msgRecord = await base44.asServiceRole.entities.Message.create(
              {
                customer_id: customer_id,
                customer_name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
                phone_number: canonicalTo,
                direction: "outbound",
                from_number: canonicalFrom,
                to_number: canonicalTo,
                body: message,
                media_urls: [],
                channel: isMms ? "mms" : "sms",
                status: smsStatus,
                message_id: confirmationId || null,
                is_read: true,
                sent_at: now,
              }
            );
            smsMessageId = msgRecord?.id || "";
          } catch (msgErr) {
            console.error(
              "[sendCustomerNotification] Failed to log SMS message:",
              msgErr?.message || msgErr
            );
          }
        }
      }
    } else if (!wantSms) {
      smsStatus = customer.sms_opt_out ? "skipped" : "skipped";
    }

    // ─── Create or update CustomerNotification record ───
    const channelsAttempted = [];
    if (wantEmail) channelsAttempted.push("email");
    if (wantSms) channelsAttempted.push("sms");

    const recordData = {
      event_type,
      idempotency_key,
      customer_id,
      customer_name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
      job_id: job_id || "",
      entity_id: entity_id || "",
      entity_label: entity_label || "",
      channels_attempted: channelsAttempted,
      email_status: emailStatus,
      email_error: emailError,
      sms_status: smsStatus,
      sms_error: smsError,
      sms_message_id: smsMessageId,
      subject: subject || "",
      body_preview: (sms_body || email_body || "").substring(0, 200),
      link_url: link_url || "",
      sent_by: user.full_name || user.email || "Admin",
      sent_at: new Date().toISOString(),
    };

    let record;
    if (existing) {
      record = await base44.asServiceRole.entities.CustomerNotification.update(
        existing.id,
        recordData
      );
    } else {
      record = await base44.asServiceRole.entities.CustomerNotification.create(
        recordData
      );
    }

    return Response.json({ ...record, idempotent: false });
  } catch (error) {
    console.error(
      "[sendCustomerNotification] error:",
      error?.message || error
    );
    return Response.json(
      { error: error?.message || "Failed to send notification" },
      { status: 500 }
    );
  }
}