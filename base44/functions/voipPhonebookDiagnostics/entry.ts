import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { testVoipConnection, voipMsCall, isVoipSuccess, isVoipNoRecords } from '../../shared/voipMsApi.ts';

// Diagnostic function — reports the server's outbound IP address and direct
// VoIP.ms API connection status so the admin can verify the integration is working.
//
// No payload required. Admin-only.

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    } catch (_) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get outbound IP from a public IP echo service
    let outboundIp = "";
    let ipSource = "";
    try {
      const resp = await fetch("https://api.ipify.org?format=json");
      const data = await resp.json();
      outboundIp = data.ip || "";
      ipSource = "ipify";
    } catch (_) {
      try {
        const resp = await fetch("https://httpbin.org/ip");
        const data = await resp.json();
        outboundIp = (data.origin || "").split(",")[0].trim();
        ipSource = "httpbin";
      } catch (_) {
        outboundIp = "Unable to determine";
      }
    }

    // Test direct VoIP.ms connection via getIP
    const connectionTest = await testVoipConnection();

    // Also verify an authenticated read (getPhonebook) succeeds
    let phonebookTest: { ok: boolean; status: string; message: string } = { ok: false, status: "", message: "" };
    try {
      const data = await voipMsCall("getPhonebook", {});
      const ok = isVoipSuccess(data) || isVoipNoRecords(data);
      phonebookTest = {
        ok,
        status: data?.status || "",
        message: ok ? "Authenticated read successful" : (data?.message || "Unexpected status"),
      };
    } catch (e: any) {
      phonebookTest = { ok: false, status: e?.voipmsStatus || "", message: String(e?.message || e) };
    }

    return Response.json({
      outbound_ip: outboundIp,
      ip_source: ipSource,
      direct_api_mode: true,
      connection: connectionTest,
      phonebook_read: phonebookTest,
      recommendation: connectionTest.ok && phonebookTest.ok
        ? "Direct VoIP.ms API access is working. Phone book sync and SMS sending operate without the bridge."
        : "Direct VoIP.ms API access failed. Check VOIP_MS_API_USERNAME and VOIP_MS_API_PASSWORD secrets, and verify the outbound IP is authorized in VoIP.ms API restrictions.",
    });
  } catch (e) {
    console.error("voipPhonebookDiagnostics error:", e?.message || e);
    return Response.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}