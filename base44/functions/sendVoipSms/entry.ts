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

    /*
     * Keep two versions of the destination number:
     *
     * canonicalTo:
     * Stored in Base44 as an 11-digit number beginning with 1.
     * This keeps SMS and MMS records grouped in the same conversation.
     *
     * apiTo:
     * Sent to VoIP.ms as a 10-digit NANPA number.
     */
    const toRaw = String(body?.to || '');
    let canonicalTo = toRaw.replace(/\D/g, '');

    if (!canonicalTo) {
      return Response.json(
        { error: 'Missing destination number' },
        { status: 400 }
      );
    }

    if (canonicalTo.length === 10) {
      canonicalTo = `1${canonicalTo}`;
    }

    if (
      canonicalTo.length !== 11 ||
      !canonicalTo.startsWith('1')
    ) {
      return Response.json(
        {
          error:
            'Destination must be a valid U.S. or Canadian phone number',
        },
        { status: 400 }
      );
    }

    const apiTo = canonicalTo.slice(1);

    const message = String(body?.message || '').trim();

    if (!message) {
      return Response.json(
        { error: 'Missing message body' },
        { status: 400 }
      );
    }

    if (message.length > 2048) {
      return Response.json(
        {
          error:
            'Message too long. Maximum MMS text length is 2,048 characters.',
        },
        { status: 400 }
      );
    }

    /*
     * Keep separate API and database versions of the sending number too.
     */
    const fromRaw = String(
      Deno.env.get('VOIP_MS_FROM_NUMBER') || ''
    ).trim();

    let canonicalFrom = fromRaw.replace(/\D/g, '');

    if (canonicalFrom.length === 10) {
      canonicalFrom = `1${canonicalFrom}`;
    }

    if (
      canonicalFrom.length !== 11 ||
      !canonicalFrom.startsWith('1')
    ) {
      return Response.json(
        {
          error:
            'VOIP_MS_FROM_NUMBER must be a valid U.S. or Canadian phone number',
        },
        { status: 500 }
      );
    }

    const apiFrom = canonicalFrom.slice(1);

    const apiUser = Deno.env.get('VOIP_MS_API_USERNAME');
    const apiPass = Deno.env.get('VOIP_MS_API_PASSWORD');

    if (!apiUser || !apiPass) {
      return Response.json(
        { error: 'VoIP.ms API credentials are not configured' },
        { status: 500 }
      );
    }

    /*
     * Send short messages as SMS.
     * Send messages over 160 characters as MMS.
     */
    const isMms = message.length > 160;
    const method = isMms ? 'sendMMS' : 'sendSMS';

    const params = new URLSearchParams({
      api_username: apiUser,
      api_password: apiPass,
      method,
      did: apiFrom,
      dst: apiTo,
      message,
      content_type: 'json',
    });

    const url =
      `https://voip.ms/api/v1/rest.php?${params.toString()}`;

    const resp = await fetch(url);
    const data = await resp.json().catch(() => null);

    if (!resp.ok || !data || data.status !== 'success') {
      console.error(
        `${method} failed`,
        JSON.stringify({
          httpStatus: resp.status,
          response: data,
          destination: apiTo,
          characterCount: message.length,
        })
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

    /*
     * Always save phone_number and to_number in the same canonical format.
     * This prevents SMS and MMS from creating separate conversations.
     */
    await base44.asServiceRole.entities.Message.create({
      customer_id: body?.customer_id || null,
      customer_name: body?.customer_name || null,

      phone_number: canonicalTo,

      direction: 'outbound',

      from_number: canonicalFrom,
      to_number: canonicalTo,

      body: message,

      channel: isMms ? 'mms' : 'sms',

      status: 'sent',
      is_read: true,
      sent_at: now,
    });

    return Response.json({
      success: true,
      to: canonicalTo,
      api_to: apiTo,
      message,
      message_type: isMms ? 'mms' : 'sms',
      character_count: message.length,
    });
  } catch (error) {
    console.error(
      'sendVoipSms error:',
      error?.message || error
    );

    return Response.json(
      {
        error:
          error?.message ||
          'Internal error',
      },
      { status: 500 }
    );
  }
});