import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);

    // Collect params from GET query string OR POST body (form or JSON)
    let params: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) {
      params[k] = v;
    }

    if (req.method === 'POST') {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          const body = await req.json();
          if (body && typeof body === 'object') {
            for (const [k, v] of Object.entries(body)) {
              if (typeof v === 'string' || typeof v === 'number') params[k] = String(v);
            }
          }
        } catch (_) { /* ignore parse error */ }
      } else {
        try {
          const text = await req.text();
          const formParams = new URLSearchParams(text);
          for (const [k, v] of formParams.entries()) {
            params[k] = v;
          }
        } catch (_) { /* ignore parse error */ }
      }
    }

    console.log('receiveVoipSms params:', JSON.stringify(params));

    // Validate using the api_key parameter (user appends ?api_key=<VOIP_MS_API_PASSWORD> to the callback URL)
    const apiKey = params['api_key'] || '';
    const expectedKey = Deno.env.get('VOIP_MS_API_PASSWORD') || '';
    if (!expectedKey || apiKey !== expectedKey) {
      console.error('api_key mismatch — got:', apiKey, 'expected present:', !!expectedKey);
      return Response.json({ error: 'Invalid api_key' }, { status: 403 });
    }

    const fromNumber = (params['from'] || params['From'] || '').replace(/\D/g, '');
    const toNumber = (params['to'] || params['To'] || '').replace(/\D/g, '');
    const message = params['message'] || params['Message'] || params['text'] || params['Text'] || '';
    const messageId = params['id'] || params['sms_id'] || params['message_id'] || '';
    const date = params['date'] || params['Date'] || '';

    if (!fromNumber || !message) {
      console.error('Missing required fields — from:', fromNumber, 'message:', !!message);
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Normalize: US/CA numbers to 11 digits
    let normalizedFrom = fromNumber;
    if (normalizedFrom.length === 10) normalizedFrom = '1' + normalizedFrom;

    // Try to resolve a matching customer by phone number
    let customerId: string | null = null;
    let customerName: string | null = null;
    try {
      const customers = await base44.asServiceRole.entities.Customer.list('-created_date', 500);
      const match = customers.find(c => {
        const custPhone = (c.phone || '').replace(/\D/g, '');
        if (!custPhone) return false;
        const normalizedCust = custPhone.length === 10 ? '1' + custPhone : custPhone;
        return normalizedCust === normalizedFrom || custPhone === fromNumber || custPhone.endsWith(fromNumber) || fromNumber.endsWith(custPhone);
      });
      if (match) {
        customerId = match.id;
        customerName = `${match.first_name} ${match.last_name}`.trim();
      }
    } catch (e) {
      console.error('Customer lookup failed:', e?.message || e);
    }

    // Avoid duplicate storage if VoIP.ms retries the same message ID
    if (messageId) {
      try {
        const existing = await base44.asServiceRole.entities.Message.filter({ message_id: messageId });
        if (existing && existing.length > 0) {
          return Response.json({ success: true, duplicate: true });
        }
      } catch (e) {
        // filter may not be supported identically; proceed
      }
    }

    // VoIP.ms sends the date in an ambiguous timezone; use the actual server receipt time (UTC)
    const sentAt = new Date().toISOString();

    await base44.asServiceRole.entities.Message.create({
      customer_id: customerId,
      customer_name: customerName,
      phone_number: normalizedFrom,
      direction: 'inbound',
      from_number: normalizedFrom,
      to_number: toNumber,
      body: message,
      message_id: messageId,
      status: 'received',
      is_read: false,
      sent_at: sentAt,
    });

    console.log('SMS stored from', normalizedFrom, '-', message.substring(0, 50));

    // Send push notification to all subscribed devices
    try {
      const pushTitle = customerName ? 'New SMS from ' + customerName : 'New SMS from ' + normalizedFrom;
      const pushBody = message.substring(0, 200);
      await base44.asServiceRole.functions.invoke('sendPushNotification', {
        title: pushTitle,
        body: pushBody,
        phone: normalizedFrom,
        url: '/Messaging?phone=' + normalizedFrom,
      });
    } catch (pushErr) {
      console.error('Push notification failed:', pushErr?.message || pushErr);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('receiveVoipSms error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});