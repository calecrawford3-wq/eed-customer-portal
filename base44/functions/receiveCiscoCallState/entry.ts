import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { waitUntil } from "base44:runtime";
import { sendPushToAllSubscriptions } from '../../shared/sendPush.ts';
import { resolveCaller } from '../../shared/resolveCaller.ts';
import { getLatestInboundCdr, parseVoipCdrDateMs } from '../../shared/voipMs.ts';

// Secure webhook for the local Cisco→Node bridge.
// The bridge POSTs { event: "cisco_call_state", phone, line, callId, callState, receivedAt }
// with an x-webhook-secret header (or ?key= / body.secret) equal to the BRIDGE_SECRET secret.
//
// VoIP.ms has no live-call API, so the caller number is fetched from getCDR with retries —
// the CDR only appears once the call is Connected (answered) or Idle (terminated).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function norm(p) {
  if (!p) return "";
  let d = String(p || "").replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return d;
}

function fmtPhone(p) {
  if (!p) return "";
  let d = String(p).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

function dispToStatus(disp) {
  const d = String(disp || "").toLowerCase().replace(/[\s-]/g, "_");
  if (d.includes("no_answer") || d === "noanswer") return "no_answer";
  if (d === "busy") return "busy";
  if (d === "failed") return "failed";
  if (d === "missed") return "missed";
  return "connected";
}

async function findActive(base44, phone, line) {
  const recs = await base44.asServiceRole.entities.IncomingCall.filter({ phone, line }, "-created_date", 10);
  return (recs || []).find((r) => r.call_state === "ringing" || r.call_state === "connected") || null;
}

// Retry the VoIP.ms CDR lookup, then resolve + notify. Runs in the background via waitUntil.
async function runLookupLoop(base44, recordId, maxAttempts, intervalMs, isFinal) {
  const did = Deno.env.get("VOIP_MS_FROM_NUMBER") || "";
  const didNorm = norm(did);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let rec;
    try { rec = await base44.asServiceRole.entities.IncomingCall.get(recordId); } catch (_) { return; }
    if (!rec || rec.lookup_status === "resolved") return;

    let cdr = null;
    try { cdr = await getLatestInboundCdr(base44, { didNorm, withinMinutes: 5 }); } catch (e) { console.warn("getLatestInboundCdr failed:", e?.message || e); }

    if (cdr && cdr.callerNumber) {
      const taken = await isUniqueidTaken(base44, cdr.uniqueid, recordId);
      if (!taken) {
        await applyResolution(base44, rec, cdr);
        return;
      }
    }

    try { await base44.asServiceRole.entities.IncomingCall.update(recordId, { lookup_attempts: attempt }); } catch (_) {}
    if (attempt < maxAttempts) await sleep(intervalMs);
  }

  if (isFinal) {
    try { await base44.asServiceRole.entities.IncomingCall.update(recordId, { lookup_status: "not_found" }); } catch (_) {}
  }
}

// Prevents the same VoIP.ms call being attached to two IncomingCall records or double-creating a CallLog.
async function isUniqueidTaken(base44, uniqueid, exceptRecordId) {
  if (!uniqueid) return false;
  try {
    const calls = await base44.asServiceRole.entities.CallLog.filter({ voip_call_id: uniqueid }, "-created_date", 5);
    if (calls && calls.length) return true;
  } catch (_) {}
  try {
    const incs = await base44.asServiceRole.entities.IncomingCall.filter({ voip_unique_id: uniqueid }, "-created_date", 10);
    if (incs && incs.some((i) => i.id !== exceptRecordId && i.lookup_status === "resolved")) return true;
  } catch (_) {}
  return false;
}

async function applyResolution(base44, rec, cdr) {
  const callerNumber = cdr.callerNumber;
  const r = await resolveCaller(base44, callerNumber);

  const callerName =
    r.match_type === "contact" ? `${r.contact_name}${r.customer_name ? ` (${r.customer_name})` : ""}` :
    r.match_type === "customer" ? (r.customer_name || fmtPhone(callerNumber)) :
    r.match_type === "supplier" ? (r.supplier_name || "Supplier") :
    fmtPhone(callerNumber);

  const startedAt = rec.started_at || (cdr.date ? new Date(parseVoipCdrDateMs(cdr.date)).toISOString() : new Date().toISOString());
  const status = dispToStatus(cdr.disposition);

  // Mirror into CallLog so the Calls list shows the call in real time and fetchVoipCdr dedupes it.
  let callLogId = "";
  try {
    const cl = await base44.asServiceRole.entities.CallLog.create({
      customer_id: r.customer_id || "",
      customer_name: r.customer_name || "",
      contact_name: r.contact_name || "",
      phone_number: callerNumber,
      direction: "inbound",
      call_status: status,
      duration_seconds: Number(cdr.seconds) || 0,
      started_at: startedAt,
      source: "voip_cdr",
      via_voip: true,
      voip_call_id: cdr.uniqueid || "",
    });
    callLogId = cl.id || "";
  } catch (e) { console.warn("CallLog create failed:", e?.message || e); }

  await base44.asServiceRole.entities.IncomingCall.update(rec.id, {
    caller_number: callerNumber,
    caller_name: callerName,
    customer_id: r.customer_id || "",
    customer_name: r.customer_name || "",
    contact_name: r.contact_name || "",
    contact_id: r.contact_id || "",
    supplier_id: r.supplier_id || "",
    supplier_name: r.supplier_name || "",
    match_type: r.match_type || "none",
    lookup_status: "resolved",
    voip_unique_id: cdr.uniqueid || "",
    call_log_id: callLogId,
  });

  // No late push notification — the shop was already alerted at ringing time.
  // The CDR resolution still updates the IncomingCall record and creates a CallLog silently.
}

async function updateLinkedCallLog(base44, rec) {
  if (!rec.call_log_id) return;
  try {
    await base44.asServiceRole.entities.CallLog.update(rec.call_log_id, {
      duration_seconds: rec.duration_seconds || 0,
      call_status: rec.duration_seconds > 0 ? "connected" : "no_answer",
    });
  } catch (_) {}
}

export default async function(req: Request): Promise<Response> {
  try {
    // --- Auth: shared secret (BRIDGE_SECRET) ---
    // Accepts either:
    //  (a) raw secret in x-webhook-secret header / ?key= / body.secret, OR
    //  (b) HMAC-SHA256 signature in X-Elite-Signature over `${timestamp}.${rawBody}`
    //      (this is how the local Cisco bridge signs its requests)
    const expected = Deno.env.get("BRIDGE_SECRET") || "";
    const url = new URL(req.url);
    const rawBodyText = req.method === "POST" ? await req.text() : "";
    let body: any = {};
    if (rawBodyText) {
      try { body = JSON.parse(rawBodyText); } catch (_) { /* allow empty */ }
    }
    const provided =
      req.headers.get("x-webhook-secret") ||
      url.searchParams.get("key") ||
      "";
    const bodySecret = body && typeof body === "object" ? String(body.secret || "") : "";

    let hmacOk = false;
    const sig = req.headers.get("x-elite-signature") || "";
    const ts = req.headers.get("x-elite-timestamp") || "";
    if (expected && sig && ts) {
      const tsNum = Number(ts);
      const ageMs = Math.abs(Date.now() - tsNum);
      if (Number.isFinite(tsNum) && ageMs < 5 * 60 * 1000) {
        try {
          const hmacKey = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(expected),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
          );
          const sigBuf = await crypto.subtle.sign(
            "HMAC",
            hmacKey,
            new TextEncoder().encode(`${ts}.${rawBodyText}`)
          );
          const hex = Array.from(new Uint8Array(sigBuf))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          hmacOk = hex === sig;
        } catch (_) { hmacOk = false; }
      }
    }

    if (!expected || (provided !== expected && bodySecret !== expected && !hmacOk)) {
      return Response.json({ error: "Invalid webhook secret" }, { status: 403 });
    }

    const event = String(body.event || "");
    if (event !== "cisco_call_state") {
      return Response.json({ error: "Unknown event" }, { status: 400 });
    }

    const phone = String(body.phone || body.source || "shop_cisco");
    const line = Number(body.line ?? 1);
    const callId = Number(body.callId ?? 0);
    const callState = String(body.callState || "").toLowerCase();
    // Use server UTC time for all stored timestamps — the bridge clock may be
    // misconfigured (e.g. wrong DST offset), which was shifting call times by an hour.
    const receivedAt = new Date().toISOString();

    const base44 = createClientFromRequest(req);
    const now = new Date();
    const DEDUP_MS = 60 * 1000;

    if (callState === "ringing") {
      // Dedup: an active (non-idle) call on the same line+phone within the window is a duplicate Ringing.
      const recent = await base44.asServiceRole.entities.IncomingCall.filter({ phone, line }, "-created_date", 10);
      const dupe = (recent || []).find((r) => r.call_state !== "idle" && (now.getTime() - new Date(r.created_date).getTime()) < DEDUP_MS);
      if (dupe) {
        return Response.json({ ok: true, dedup: true, call_record_id: dupe.id });
      }
      const rec = await base44.asServiceRole.entities.IncomingCall.create({
        line, cisco_call_id: callId, phone, call_state: "ringing",
        started_at: receivedAt, lookup_status: "pending", lookup_attempts: 0, match_type: "none",
        push_sent: true,
      });
      // Send an immediate push so the shop knows a call is coming in — the CDR
      // (and thus the caller name) won't be available until the call is answered or ended.
      try {
        await sendPushToAllSubscriptions(base44, {
          title: "📞 Incoming Call",
          body: "Remember to log call details after the call.",
          url: "/Messaging",
        });
      } catch (e) { console.warn("ringing push failed:", e?.message || e); }
      // CDR likely won't exist yet while ringing, but start retrying — it'll land on Connected/Idle.
      waitUntil(runLookupLoop(base44, rec.id, 8, 2500, false));
      return Response.json({ ok: true, created: true, call_record_id: rec.id });
    }

    if (callState === "connected") {
      const active = await findActive(base44, phone, line);
      if (active) {
        await base44.asServiceRole.entities.IncomingCall.update(active.id, { call_state: "connected", connected_at: receivedAt });
        if (active.lookup_status === "pending") {
          waitUntil(runLookupLoop(base44, active.id, 6, 2000, false));
        }
        return Response.json({ ok: true, updated: true, call_record_id: active.id });
      }
      // Missed the Ringing event — create a connected record.
      const rec = await base44.asServiceRole.entities.IncomingCall.create({
        line, cisco_call_id: callId, phone, call_state: "connected",
        started_at: receivedAt, connected_at: receivedAt, lookup_status: "pending", lookup_attempts: 0, match_type: "none",
      });
      waitUntil(runLookupLoop(base44, rec.id, 6, 2000, false));
      return Response.json({ ok: true, created: true, call_record_id: rec.id });
    }

    if (callState === "idle") {
      const active = await findActive(base44, phone, line);
      if (active) {
        const connectedAt = active.connected_at ? new Date(active.connected_at).getTime() : 0;
        const endMs = new Date(receivedAt).getTime();
        const duration = connectedAt ? Math.max(0, Math.round((endMs - connectedAt) / 1000)) : 0;
        await base44.asServiceRole.entities.IncomingCall.update(active.id, {
          call_state: "idle", ended_at: receivedAt, duration_seconds: duration,
        });
        if (active.lookup_status === "pending") {
          // CDR should exist now — final retry pass (tighter polling to resolve faster).
          waitUntil(runLookupLoop(base44, active.id, 12, 1000, true));
        } else {
          // Already resolved earlier — sync final duration/status onto the linked CallLog.
          const updated = { ...active, duration_seconds: duration, call_state: "idle" };
          waitUntil(updateLinkedCallLog(base44, updated));
        }
        return Response.json({ ok: true, updated: true, call_record_id: active.id });
      }
      return Response.json({ ok: true, noop: true });
    }

    return Response.json({ error: "Unrecognized callState" }, { status: 400 });
  } catch (e) {
    console.error("receiveCiscoCallState error:", e?.message || e);
    return Response.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}