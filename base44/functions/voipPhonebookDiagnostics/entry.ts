import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { testVoipConnection, isBridgeMode } from '../../shared/voipPhonebook.ts';

// Diagnostic function — reports the server's outbound IP address and VoIP.ms
// API connection status so the admin can whitelist the IP in VoIP.ms.
//
// If the outbound IP is not stable (Base44 uses dynamic IPs), the admin should
// set the VOIPMS_BRIDGE_URL secret to route calls through the ElitePhoneBridge
// on the shop computer (which has a stable whitelisted IP).
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
      // Fallback
      try {
        const resp = await fetch("https://httpbin.org/ip");
        const data = await resp.json();
        outboundIp = (data.origin || "").split(",")[0].trim();
        ipSource = "httpbin";
      } catch (_) {
        outboundIp = "Unable to determine";
      }
    }

    // Test VoIP.ms API connection
    const connectionTest = await testVoipConnection();

    // Check if bridge mode is configured
    const bridgeMode = isBridgeMode();
    const bridgeUrl = Deno.env.get("VOIPMS_BRIDGE_URL") || "";

    return Response.json({
      outbound_ip: outboundIp,
      ip_source: ipSource,
      bridge_mode: bridgeMode,
      bridge_url_configured: !!bridgeUrl,
      voipms_connection: connectionTest,
      recommendation: bridgeMode
        ? "Bridge mode is active — VoIP.ms API calls are proxied through the ElitePhoneBridge. Ensure the shop computer's IP is whitelisted in VoIP.ms."
        : outboundIp && outboundIp !== "Unable to determine"
          ? `Add ${outboundIp} to the VoIP.ms API whitelist (Main Menu > API Settings). If this IP changes, enable bridge mode by setting VOIPMS_BRIDGE_URL.`
          : "Unable to determine outbound IP. Enable bridge mode by setting VOIPMS_BRIDGE_URL to route through the shop computer.",
    });
  } catch (e) {
    console.error("voipPhonebookDiagnostics error:", e?.message || e);
    return Response.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}