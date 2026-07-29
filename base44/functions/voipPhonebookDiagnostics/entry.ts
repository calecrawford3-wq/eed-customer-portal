import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { testBridgeConnection, isBridgeMode, getBridgeUrl } from '../../shared/voipPhonebook.ts';

// Diagnostic function — reports the server's outbound IP address and bridge
// connection status so the admin can verify the ElitePhoneBridge is working.
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

    // Test bridge connection via getIP
    const connectionTest = await testBridgeConnection();

    const bridgeMode = isBridgeMode();
    const bridgeUrl = getBridgeUrl();

    return Response.json({
      outbound_ip: outboundIp,
      ip_source: ipSource,
      bridge_mode: bridgeMode,
      bridge_url_configured: !!bridgeUrl,
      bridge_connection: connectionTest,
      recommendation: bridgeMode
        ? "Bridge mode is active — VoIP.ms API calls are proxied through the ElitePhoneBridge. Ensure the bridge's VoIP.ms credentials and IP whitelist are correct."
        : "VOIPMS_BRIDGE_URL is not set. Configure it to point to the ElitePhoneBridge proxy endpoint.",
    });
  } catch (e) {
    console.error("voipPhonebookDiagnostics error:", e?.message || e);
    return Response.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}