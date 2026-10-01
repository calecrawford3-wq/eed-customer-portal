import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendPushToAllSubscriptions } from '../../shared/sendPush.ts';
import { resolveCaller } from '../../shared/resolveCaller.ts';
import { parseVoipCdrDateMs } from '../../shared/voipMs.ts';

function normalizePhone(p) {
  if (!p) return "";
  let d = p.replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return d;
}

// VoIP.ms callerid looks like "John" <1234567890> or <1234567890> or 1234567890
function extractDigits(callerid) {
  if (!callerid) return "";
  const m = String(callerid).match(/<(\d+)>/);
  if (m) return m[1];
  const m2 = String(callerid).match(/(\d{10,15})/);
  if (m2) return m2[1];
  return String(callerid).replace(/\D/g, "");
}

function dispositionToStatus(disp) {
  const d = (disp || "").toLowerCase().replace(/[\s-]/g, "_");
  if (d.includes("no_answer") || d === "noanswer") return "no_answer";
  if (d === "busy") return "busy";
  if (d === "failed") return "failed";
  if (d === "missed") return "missed";
  return "connected";
}

function formatPhoneDisplay(p) {
  if (!p) return "";
  let d = p.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

function fmtDuration(s) {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const apiUser = Deno.env.get("VOIP_MS_API_USERNAME");
    const apiPass = Deno.env.get("VOIP_MS_API_PASSWORD");
    if (!apiUser || !apiPass) {
      return Response.json({ error: "VoIP.ms not configured" }, { status: 500 });
    }

    // Poll the last 2 days of CDR (timezone=0 = UTC so dates parse cleanly to ISO)
    const now = new Date();
    const from = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dateFrom = fmt(from);
    const dateTo = fmt(now);

    // Build a dedupe set from voip_call_id on existing logs
    const existing = await base44.asServiceRole.entities.CallLog.list("-created_date", 200);
    const seenIds = new Set((existing || []).map((l) => l.voip_call_id).filter(Boolean));

    let allRecords = [];
    for (let page = 1; page <= 3; page++) {
      const url = `https://voip.ms/api/v1/rest.php?api_username=${encodeURIComponent(apiUser)}&api_password=${encodeURIComponent(apiPass)}&method=getCDR&date_from=${dateFrom}&date_to=${dateTo}&timezone=0&answered=1&noanswer=1&busy=1&failed=1&page=${page}`;
      const resp = await fetch(url);
      const data = await resp.json().catch(() => null);
      if (!data || data.status !== "success") {
        console.error("getCDR page " + page + " failed:", JSON.stringify(data));
        break;
      }
      const cdr = Array.isArray(data.cdr) ? data.cdr : [];
      allRecords = allRecords.concat(cdr);
      if (cdr.length < 50) break; // last page
    }

    let created = 0;
    let outboundNotified = 0;
    for (const c of allRecords) {
      const callId = c.uniqueid || "";
      if (callId && seenIds.has(callId)) continue;

      const destType = String(c.destination_type || "").toUpperCase();
      const isInbound = destType.startsWith("IN");
      const isOutbound = destType.startsWith("OUT");
      if (!isInbound && !isOutbound) continue;

      // Inbound: callerid = caller. Outbound: callerid = our caller ID, destination = number we called.
      const rawPhone = isInbound ? (c.callerid || "") : (c.destination || c.callerid || "");
      const phone = normalizePhone(extractDigits(rawPhone));
      if (!phone) continue;

      let resolved = { customer_id: "", customer_name: "", contact_name: "", relationship: "" };
      try { resolved = await resolveCaller(base44, phone); } catch (e) { console.warn("resolveCaller failed:", e?.message || e); }
      const contactName = resolved.contact_name || "";
      const duration = Number(c.seconds) || 0;
      // VoIP.ms CDR dates arrive in Europe/London time; parseVoipCdrDateMs converts to true UTC.
      const startedMs = c.date ? parseVoipCdrDateMs(c.date) : 0;
      const startedAt = startedMs ? new Date(startedMs).toISOString() : new Date().toISOString();

      const endedAt = duration > 0
        ? new Date(new Date(startedAt).getTime() + duration * 1000).toISOString()
        : startedAt;
      try {
        const rec = await base44.asServiceRole.entities.CallLog.create({
          customer_id: resolved.customer_id || "",
          customer_name: resolved.customer_name || "",
          contact_name: contactName || "",
          phone_number: phone,
          direction: isOutbound ? "outbound" : "inbound",
          call_status: dispositionToStatus(c.disposition),
          outcome: c.disposition || "",
          notes: "",
          duration_seconds: duration,
          started_at: startedAt,
          ended_at: endedAt,
          source: "voip_cdr",
          via_voip: true,
          voip_call_id: callId,
        });
        if (callId) seenIds.add(callId);
        created++;

        // Outbound calls have no real-time webhook — notify here.
        // Inbound calls are notified by receiveCiscoCallState, so skip to avoid duplicates.
        if (isOutbound) {
          const statusLabel = (rec.call_status || "outbound").replace(/_/g, " ");
          const dispPhone = formatPhoneDisplay(phone);
          const who = contactName ? (contactName + (rec.customer_name ? ` (${rec.customer_name})` : "")) : (rec.customer_name || "");
          const pushTitle = who ? `Called ${who}` : `Called ${dispPhone}`;
          const pushBody = `${dispPhone} · ${statusLabel}${duration > 0 ? ` · ${fmtDuration(duration)}` : ""}`;
          try {
            await sendPushToAllSubscriptions(base44, { title: pushTitle, body: pushBody, url: `/Messaging?callId=${rec.id}` });
            outboundNotified++;
          } catch (pe) { console.warn("push failed:", pe?.message || pe); }
        }
      } catch (e) {
        console.warn("CallLog create failed for callid " + callId + ":", e?.message || e);
      }
    }

    return Response.json({ success: true, scanned: allRecords.length, created, outboundNotified, from: dateFrom, to: dateTo });
  } catch (error) {
    console.error("fetchVoipCdr error:", error?.message || error);
    return Response.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
});