import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from "base44:runtime";

// Click-to-call for a Cisco 7800/8800 desk phone. Pushes a CiscoIPPhoneExecute
// "Dial:" XML object to the phone's /CGI/Execute endpoint over the configured
// tunnel URL, authenticated with the phone's web admin credentials. The phone
// goes off-hook and dials the customer number just as if the user dialed it.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const toRaw = (body?.to || "").toString();
    let to = toRaw.replace(/\D/g, "");
    if (!to) return Response.json({ error: "Missing destination number" }, { status: 400 });
    if (to.length === 10) to = "1" + to;

    const baseUrl = (secrets.get("CISCO_PHONE_URL") || "").trim().replace(/\/+$/, "");
    const phoneUser = (secrets.get("CISCO_PHONE_USER") || "").trim();
    const phonePass = secrets.get("CISCO_PHONE_PASS") || "";
    if (!baseUrl || !phoneUser || !phonePass) {
      return Response.json({
        error: "Cisco phone not configured. Set CISCO_PHONE_URL, CISCO_PHONE_USER, and CISCO_PHONE_PASS in app secrets."
      }, { status: 500 });
    }

    const xml = `<CiscoIPPhoneExecute><ExecuteItem URL="Dial:${to}" Priority="0"/></CiscoIPPhoneExecute>`;
    const endpoint = `${baseUrl}/CGI/Execute`;
    const authHeader = `Basic ${btoa(`${phoneUser}:${phonePass}`)}`;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": authHeader,
      },
      body: `XML=${encodeURIComponent(xml)}`,
    });

    const respText = await resp.text();

    if (!resp.ok) {
      console.error("cisco dial HTTP error:", resp.status, respText);
      return Response.json({
        error: `Cisco phone rejected the dial request (HTTP ${resp.status}). Confirm the phone is online, the tunnel URL is reachable, and the admin credentials are correct.`,
        status: resp.status,
        raw: respText
      }, { status: 502 });
    }

    // Cisco returns <CiscoIPPhoneResponse Status="0"/> on success.
    const statusMatch = respText.match(/<CiscoIPPhoneResponse[^>]*Status="(-?\d+)"/i);
    const phoneStatus = statusMatch ? parseInt(statusMatch[1], 10) : null;
    if (phoneStatus !== null && phoneStatus !== 0) {
      console.error("cisco dial status error:", phoneStatus, respText);
      return Response.json({
        error: `Cisco phone returned status ${phoneStatus}. The dial command was not accepted.`,
        raw: respText
      }, { status: 502 });
    }

    return Response.json({ success: true, to, raw: respText });
  } catch (error) {
    console.error("voipClick2Call error:", error?.message || error);
    return Response.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}