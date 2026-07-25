import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // VoIP.ms sends incoming SMS as GET with query params: to, from, message, id, date, api_key
    const url = new URL(req.url);
    const params = url.searchParams;

    // Validate using the api_key parameter (VoIP.ms sends the API password)
    const apiKey = params.get('api_key') || '';
    const expectedKey = Deno.env.get('VOIP_MS_API_PASSWORD') || '';
    if (!expectedKey || apiKey !== expectedKey) {
      return Response.json({ error: 'Invalid api_key' }, { status: 403 });
    }

    const fromNumber = (params.get('from') || '').replace(/\D/g, '');
    const toNumber = (params.get('to') || '').replace(/\D/g, '');
    const message = params.get('message') || '';
    const messageId = params.get('id') || '';
    const date = params.get('date') || '';

    if (!fromNumber || !message) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Normalize: US/CA numbers to 11 digits
    let normalizedFrom = fromNumber;
    if (normalizedFrom.length === 10) normalizedFrom = '1' + normalizedFrom;

    // Try to resolve a matching customer by phone number
    let customerId = null;
    let customerName = null;
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

    const sentAt = date ? new Date(date.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')).toISOString() : new Date().toISOString();

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

    return Response.json({ success: true });
  } catch (error) {
    console.error('receiveVoipSms error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});