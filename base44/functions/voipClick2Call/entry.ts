import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const toRaw = (body?.to || "").toString();
    let to = toRaw.replace(/\D/g, "");
    if (!to) return Response.json({ error: "Missing destination number" }, { status: 400 });
    if (to.length === 10) to = "1" + to;
    if (to.length === 11 && to.startsWith("1")) {
      // ok, US/CA
    }

    const from = (Deno.env.get("VOIP_MS_FROM_NUMBER") || "").trim();
    const apiUser = Deno.env.get("VOIP_MS_API_USERNAME");
    const apiPass = Deno.env.get("VOIP_MS_API_PASSWORD");
    if (!from || !apiUser || !apiPass) {
      return Response.json({
        error: "VoIP.ms not configured. Set VOIP_MS_API_USERNAME, VOIP_MS_API_PASSWORD, and VOIP_MS_FROM_NUMBER in app secrets."
      }, { status: 500 });
    }

    const url = `https://voip.ms/api/v1/rest.php?api_username=${encodeURIComponent(apiUser)}&api_password=${encodeURIComponent(apiPass)}&method=click2call&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const resp = await fetch(url);
    const data = await resp.json().catch(() => null);

    if (!data || data.status !== "success") {
      console.error("voipClick2Call failed:", JSON.stringify(data));
      return Response.json({ error: data?.message || "VoIP.ms click2call failed", raw: data }, { status: 502 });
    }

    return Response.json({ success: true, from, to, raw: data });
  } catch (error) {
    console.error("voipClick2Call error:", error?.message || error);
    return Response.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
});