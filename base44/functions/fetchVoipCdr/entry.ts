import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

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

    const customers = await base44.asServiceRole.entities.Customer.list("-created_date", 500);

    // Build a dedupe set from voip_call_id on existing logs
    const existing = await base44.asServiceRole.entities.CallLog.list("-created_date", 200);
    const seenIds = new Set((existing || []).map((l) => l.voip_call_id).filter(Boolean));

    let allInbound = [];
    for (let page = 1; page <= 3; page++) {
      const url = `https://voip.ms/api/v1/rest.php?api_username=${encodeURIComponent(apiUser)}&api_password=${encodeURIComponent(apiPass)}&method=getCDR&date_from=${dateFrom}&date_to=${dateTo}&timezone=0&answered=1&noanswer=1&busy=1&failed=1&page=${page}`;
      const resp = await fetch(url);
      const data = await resp.json().catch(() => null);
      if (!data || data.status !== "success") {
        console.error("getCDR page " + page + " failed:", JSON.stringify(data));
        break;
      }
      const cdr = Array.isArray(data.cdr) ? data.cdr : [];
      // destination_type "IN:USA" = inbound; "OUT:..." = outbound (skip to avoid double-logging click2call)
      const inbound = cdr.filter((c) => String(c.destination_type || "").toUpperCase().startsWith("IN"));
      allInbound = allInbound.concat(inbound);
      if (cdr.length < 50) break; // last page
    }

    let created = 0;
    for (const c of allInbound) {
      const callId = c.uniqueid || "";
      if (callId && seenIds.has(callId)) continue;
      const phone = normalizePhone(extractDigits(c.callerid || ""));
      if (!phone) continue;
      const matched = customers.find((cust) => {
        const cp = normalizePhone(cust.phone || "");
        return cp && (cp === phone || cp.endsWith(phone) || phone.endsWith(cp));
      });
      const duration = Number(c.seconds) || 0;
      let startedAt = new Date().toISOString();
      try {
        if (c.date) startedAt = new Date(String(c.date).replace(" ", "T") + "Z").toISOString();
      } catch (_) { /* fall back to now */ }
      const endedAt = duration > 0
        ? new Date(new Date(startedAt).getTime() + duration * 1000).toISOString()
        : startedAt;
      try {
        await base44.asServiceRole.entities.CallLog.create({
          customer_id: matched?.id || "",
          customer_name: matched ? `${matched.first_name || ""} ${matched.last_name || ""}`.trim() : "",
          phone_number: phone,
          direction: "inbound",
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
      } catch (e) {
        console.warn("CallLog create failed for callid " + callId + ":", e?.message || e);
      }
    }

    return Response.json({ success: true, scanned: allInbound.length, created, from: dateFrom, to: dateTo });
  } catch (error) {
    console.error("fetchVoipCdr error:", error?.message || error);
    return Response.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
});