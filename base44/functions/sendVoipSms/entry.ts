import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const toRaw = (body?.to || "").toString();
    let to = toRaw.replace(/\D/g, "");
    if (!to) return Response.json({ error: 'Missing destination number' }, { status: 400 });
    if (to.length === 10) to = '1' + to;

    const message = (body?.message || "").toString();
    if (!message) return Response.json({ error: 'Missing message body' }, { status: 400 });
    if (message.length > 160) return Response.json({ error: 'Message too long (max 160 characters)' }, { status: 400 });

    const from = (Deno.env.get('VOIP_MS_FROM_NUMBER') || '').trim();
    const apiUser = Deno.env.get('VOIP_MS_API_USERNAME');
    const apiPass = Deno.env.get('VOIP_MS_API_PASSWORD');
    if (!from || !apiUser || !apiPass) {
      return Response.json({ error: 'VoIP.ms not configured' }, { status: 500 });
    }

    const url = `https://voip.ms/api/v1/rest.php?api_username=${encodeURIComponent(apiUser)}&api_password=${encodeURIComponent(apiPass)}&function=sendSMS&did=${encodeURIComponent(from)}&dst=${encodeURIComponent(to)}&message=${encodeURIComponent(message)}`;
    const resp = await fetch(url);
    const data = await resp.json().catch(() => null);

    if (!data || data.status !== 'success') {
      console.error('sendVoipSms failed:', JSON.stringify(data));
      return Response.json({ error: data?.message || 'VoIP.ms sendSMS failed', raw: data }, { status: 502 });
    }

    // Store the outbound message
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.Message.create({
      customer_id: body?.customer_id || null,
      customer_name: body?.customer_name || null,
      phone_number: to,
      direction: 'outbound',
      from_number: from,
      to_number: to,
      body: message,
      status: 'sent',
      is_read: true,
      sent_at: now,
    });

    return Response.json({ success: true, to, message });
  } catch (error) {
    console.error('sendVoipSms error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});