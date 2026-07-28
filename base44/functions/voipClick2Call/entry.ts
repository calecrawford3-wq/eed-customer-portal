import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from "base44:runtime";

// Click-to-call for a Cisco 7800/8800 (3PCC/MPP) desk phone whose XML execution
// mode is set to "Trusted". In Trusted mode /CGI/Execute accepts an
// unauthenticated POST, so we send a single CiscoIPPhoneExecute "Dial:" object
// directly — no login, no Digest, no session cookie.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const normalized = String(body?.to || "").replace(/[^\d*#+]/g, "");
    if (!normalized) {
      return Response.json({ error: "A valid phone number is required." }, { status: 400 });
    }

    const baseUrl = (secrets.get("CISCO_PHONE_URL") || "").trim().replace(/\/+$/, "");
    if (!baseUrl) {
      return Response.json({
        error: "Cisco phone not configured. Set CISCO_PHONE_URL in app secrets."
      }, { status: 500 });
    }

    const xml =
      `<CiscoIPPhoneExecute>` +
      `<ExecuteItem URL="Dial:${normalized}" Priority="0"/>` +
      `</CiscoIPPhoneExecute>`;

    const execResp = await fetch(`${baseUrl}/CGI/Execute`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ XML: xml }).toString(),
    });
    const execText = await execResp.text();

    if (!execResp.ok) {
      console.error("cisco execute HTTP error:", execResp.status, execText.slice(0, 200));
      return Response.json({
        error: `Cisco phone returned ${execResp.status}: ${execText}`,
        status: execResp.status,
        raw: execText
      }, { status: 502 });
    }

    const statusMatch = execText.match(/<CiscoIPPhoneResponse[^>]*Status="(-?\d+)"/i);
    const phoneStatus = statusMatch ? parseInt(statusMatch[1], 10) : null;
    if (phoneStatus !== null && phoneStatus !== 0) {
      return Response.json({ error: `Cisco phone returned status ${phoneStatus}.`, raw: execText }, { status: 502 });
    }

    return Response.json({ success: true, to: normalized, raw: execText });
  } catch (error) {
    console.error("voipClick2Call error:", error?.message || error);
    return Response.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}