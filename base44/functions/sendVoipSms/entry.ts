import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const toRaw = String(body?.to || '');
    let to = toRaw.replace(/\D/g, '');

    if (!to) {
      return Response.json(
        { error: 'Missing destination number' },
        { status: 400 }
      );
    }

    /*
     * VoIP.ms commonly expects a 10-digit NANPA destination when the DID's
     * SMS/API dialing mode is configured for NANPA.
     */
    if (to.length === 11 && to.startsWith('1')) {
      to = to.slice(1);
    }

    if (to.length !== 10) {
      return Response.json(
        { error: 'Destination must be a valid 10-digit U.S./Canada number' },
        { status: 400 }
      );
    }

    const message = String(body?.message || '').trim();

    if (!message) {
      return Response.json(
        { error: 'Missing message body' },
        { status: 400 }
      );
    }

    if (message.length > 2048) {
      return Response.json(
        { error: 'Message too long. Maximum MMS text length is 2,048 characters.' },
        { status: 400 }
      );
    }

    const fromRaw = String(
      Deno.env.get('VOIP_MS_FROM_NUMBER') || ''
    ).trim();

    let from = fromRaw.replace(/\D/g, '');

    if (from.length === 11 && from.startsWith('1')) {
      from = from.slice(1);
    }

    const apiUser = Deno.env.get('VOIP_MS_API_USERNAME');
    const apiPass = Deno.env.get('VOIP_MS_API_PASSWORD');

    if (!from || !apiUser || !apiPass) {
      return Response.json(
        { error: 'VoIP.ms not configured' },
        { status: 500 }
      );
    }

    /*
     * Messages up to 160 characters use SMS.
     * Longer messages use MMS so they arrive as one message.
     */
    const method = message.length > 160 ? 'sendMMS' : 'sendSMS';

    const params = new URLSearchParams({
      api_username: apiUser,
      api_password: apiPass,
      method,
      did: from,
      dst: to,
      message,
      content_type: 'json',
    });

    const url = `https://voip.ms/api/v1/rest.php?${params.toString()}`;

    const resp = await fetch(url);
    const data = await resp.json().catch(() => null);

    if (!data || data.status !== 'success') {
      console.error(
        `${method} failed:`,
        JSON.stringify(data)
      );

      return Response.json(
        {
          error:
            data?.message ||
            `VoIP.ms ${method} failed`,
          raw: data,
        },
        { status: 502 }
      );
    }

    const now = new Date().toISOString();

    await base44.asServiceRole.entities.Message.create({
      customer_id: body?.customer_id || null,
      customer_name: body?.customer_name || null,
      phone_number: to,
      direction: 'outbound',
      from_number: from,
      to_number: to,
      body: message,
      channel: method === 'sendMMS' ? 'mms' : 'sms',
      status: 'sent',
      is_read: true,
      sent_at: now,
    });

    return Response.json({
      success: true,
      to,
      message,
      message_type: method === 'sendMMS' ? 'mms' : 'sms',
      character_count: message.length,
    });
  } catch (error) {
    console.error(
      'sendVoipSms error:',
      error?.message || error
    );

    return Response.json(
      { error: error?.message || 'Internal error' },
      { status: 500 }
    );
  }
});