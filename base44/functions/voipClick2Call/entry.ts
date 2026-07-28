import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from "base44:runtime";

// Replicates the phone's client-side enc_value(role, password, nonce):
// builds a 127-char seed by cycling through (password + lengthString), prefixed
// with the role and suffixed with the CSRF nonce, then SHA-256 hex digests it.
function buildSeed(role, password, nonce) {
  let buffer1 = password;
  const origLen = password.length;
  if (origLen < 10) {
    buffer1 += "0" + origLen;
  } else {
    buffer1 += origLen;
  }
  const cycleLen = origLen + 2;
  let pseed2 = role;
  for (let p = 0; p < 127; p++) {
    const idx = p % cycleLen;
    pseed2 += buffer1.substring(idx, idx + 1);
  }
  pseed2 += nonce;
  return pseed2;
}

async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function cookieHeader(resp) {
  const raw = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
  return raw.map(c => c.split(";")[0]).join("; ");
}

// Click-to-call for a Cisco 7800/8800 (3PCC/MPP) desk phone. These phones do not
// accept HTTP Basic auth for /CGI/Execute, so we perform a session login (the
// same flow the web UI uses: fetch the CSRF nonce, SHA-256 the password with the
// enc_value scheme, POST to /admin, keep the session cookie), then push a
// CiscoIPPhoneExecute "Dial:" object to /CGI/Execute so the phone dials.
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
    const userSecret = (secrets.get("CISCO_PHONE_USER") || "").trim().toLowerCase();
    const role = userSecret === "user" ? "user" : "admin";
    const phonePass = secrets.get("CISCO_PHONE_PASS") || "";
    if (!baseUrl || !phonePass) {
      return Response.json({
        error: "Cisco phone not configured. Set CISCO_PHONE_URL and CISCO_PHONE_PASS in app secrets."
      }, { status: 500 });
    }

    // 1. Fetch the login page to retrieve the CSRF nonce.
    const loginPage = await fetch(`${baseUrl}/admin`, { method: "GET" });
    const loginHtml = await loginPage.text();
    const csrfMatch = loginHtml.match(/name="CSRFToken"[^>]*value="([^"]*)"/i);
    const nonce = csrfMatch ? csrfMatch[1] : "";
    if (!nonce) {
      return Response.json({
        error: "Could not retrieve the Cisco phone login token. Confirm the phone is online and the tunnel URL is correct."
      }, { status: 502 });
    }

    // 2. Log in as admin.
    const hashed = await sha256Hex(buildSeed(role, phonePass, nonce));
    const loginBody = `userName=${encodeURIComponent(role)}&userPwd=${encodeURIComponent(hashed)}&CSRFToken=${encodeURIComponent(nonce)}&submitButton=Login`;
    const loginResp = await fetch(`${baseUrl}/admin`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: loginBody,
    });
    const cookies = cookieHeader(loginResp);
    const loginText = await loginResp.text();
    if (!cookies || /loginpage|loginform/i.test(loginText)) {
      console.error("cisco login failed:", loginResp.status, loginText.slice(0, 200));
      return Response.json({ error: "Cisco phone login failed — check the admin password (CISCO_PHONE_PASS)." }, { status: 401 });
    }

    // 3. Push the Dial XML to /CGI/Execute with the session cookie.
    const xml = `<CiscoIPPhoneExecute><ExecuteItem URL="Dial:${to}" Priority="0"/></CiscoIPPhoneExecute>`;
    const execResp = await fetch(`${baseUrl}/CGI/Execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookies,
      },
      body: `XML=${encodeURIComponent(xml)}`,
    });
    const execText = await execResp.text();

    if (/loginpage|loginform/i.test(execText) || !execResp.ok) {
      console.error("cisco execute auth/HTTP error:", execResp.status, execText.slice(0, 200));
      return Response.json({
        error: `Cisco phone rejected the dial request (HTTP ${execResp.status}). The session may have expired or /CGI/Execute is not permitted for this account.`,
        status: execResp.status,
        raw: execText
      }, { status: 502 });
    }

    const statusMatch = execText.match(/<CiscoIPPhoneResponse[^>]*Status="(-?\d+)"/i);
    const phoneStatus = statusMatch ? parseInt(statusMatch[1], 10) : null;
    if (phoneStatus !== null && phoneStatus !== 0) {
      return Response.json({ error: `Cisco phone returned status ${phoneStatus}.`, raw: execText }, { status: 502 });
    }

    return Response.json({ success: true, to, raw: execText });
  } catch (error) {
    console.error("voipClick2Call error:", error?.message || error);
    return Response.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}