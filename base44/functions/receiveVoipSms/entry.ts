import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendPushToAllSubscriptions } from '../../shared/sendPush.ts';
import { resolveCaller } from '../../shared/resolveCaller.ts';

function normalizeNanpaNumber(value: string): string {
  let digits = String(value || '').replace(/\D/g, '');

  if (digits.length === 10) {
    digits = `1${digits}`;
  }

  return digits;
}

function parseMediaUrls(rawValue: string): string[] {
  const raw = String(rawValue || '').trim();

  if (!raw) return [];

  // Handle a JSON array if the provider sends one.
  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => String(item || '').trim())
        .filter((item) => /^https?:\/\//i.test(item));
    }
  } catch {
    // Not JSON. Continue with delimited parsing.
  }

  // VoIP.ms may send multiple media URLs separated by commas.
  return raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);

    /*
     * Collect parameters from:
     * 1. Query string
     * 2. JSON POST body
     * 3. Form-encoded POST body
     */
    const params: Record<string, string> = {};

    for (const [key, value] of url.searchParams.entries()) {
      params[key] = value;
    }

    if (req.method === 'POST') {
      const contentType = req.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        try {
          const body = await req.json();

          if (body && typeof body === 'object') {
            for (const [key, value] of Object.entries(body)) {
              if (
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean'
              ) {
                params[key] = String(value);
              } else if (Array.isArray(value)) {
                params[key] = JSON.stringify(value);
              }
            }
          }
        } catch {
          // Ignore malformed JSON.
        }
      } else {
        try {
          const text = await req.text();
          const formParams = new URLSearchParams(text);

          for (const [key, value] of formParams.entries()) {
            params[key] = value;
          }
        } catch {
          // Ignore malformed form body.
        }
      }
    }

    console.log(
      'receiveVoipSms params:',
      JSON.stringify({
        ...params,
        api_key: params.api_key ? '[REDACTED]' : '',
      })
    );

    /*
     * Authenticate the VoIP.ms callback.
     */
    const apiKey =
      params.api_key ||
      params.API_KEY ||
      '';

    const expectedKey =
      Deno.env.get('VOIP_MS_API_PASSWORD') ||
      '';

    if (!expectedKey || apiKey !== expectedKey) {
      console.error(
        'api_key mismatch. Received key:',
        Boolean(apiKey),
        'Expected key configured:',
        Boolean(expectedKey)
      );

      return Response.json(
        { error: 'Invalid api_key' },
        { status: 403 }
      );
    }

    /*
     * Read SMS and MMS callback fields.
     */
    const fromNumberRaw =
      params.from ||
      params.From ||
      params.FROM ||
      '';

    const toNumberRaw =
      params.to ||
      params.To ||
      params.TO ||
      '';

    const message =
      params.message ||
      params.Message ||
      params.MESSAGE ||
      params.text ||
      params.Text ||
      params.TEXT ||
      '';

    const mediaRaw =
      params.media ||
      params.Media ||
      params.MEDIA ||
      params.media_url ||
      params.mediaUrl ||
      params.attachments ||
      '';

    const messageId =
      params.id ||
      params.ID ||
      params.sms_id ||
      params.mms_id ||
      params.message_id ||
      '';

    const normalizedFrom = normalizeNanpaNumber(fromNumberRaw);
    const normalizedTo = normalizeNanpaNumber(toNumberRaw);
    const mediaUrls = parseMediaUrls(mediaRaw);

    /*
     * Photo-only MMS messages may have no text body.
     * Require a sender and either text or media.
     */
    if (!normalizedFrom || (!message.trim() && mediaUrls.length === 0)) {
      console.error(
        'Missing required fields:',
        JSON.stringify({
          hasFrom: Boolean(normalizedFrom),
          hasMessage: Boolean(message.trim()),
          mediaCount: mediaUrls.length,
        })
      );

      return Response.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    /*
     * Resolve the sender against customer and additional-contact records.
     */
    let customerId: string | null = null;
    let customerName: string | null = null;
    let contactName: string | null = null;

    try {
      const resolved = await resolveCaller(
        base44,
        normalizedFrom
      );

      customerId = resolved.customer_id || null;
      customerName = resolved.customer_name || null;
      contactName = resolved.contact_name || null;
    } catch (error) {
      console.error(
        'Caller lookup failed:',
        error?.message || error
      );
    }

    /*
     * Prevent duplicate storage if VoIP.ms retries the callback.
     */
    if (messageId) {
      try {
        const existing =
          await base44.asServiceRole.entities.Message.filter({
            message_id: messageId,
          });

        if (existing?.length > 0) {
          return Response.json({
            success: true,
            duplicate: true,
          });
        }
      } catch (error) {
        console.error(
          'Duplicate check failed:',
          error?.message || error
        );
      }
    }

    const sentAt = new Date().toISOString();
    const isMms = mediaUrls.length > 0;

    await base44.asServiceRole.entities.Message.create({
      customer_id: customerId,
      customer_name: customerName,
      contact_name: contactName,

      phone_number: normalizedFrom,
      direction: 'inbound',
      from_number: normalizedFrom,
      to_number: normalizedTo,

      body: message.trim(),
      media_urls: mediaUrls,

      channel: isMms ? 'mms' : 'sms',
      message_id: messageId,

      status: 'received',
      is_read: false,
      sent_at: sentAt,
    });

    console.log(
      `${isMms ? 'MMS' : 'SMS'} stored from`,
      normalizedFrom,
      JSON.stringify({
        textPreview: message.substring(0, 50),
        mediaCount: mediaUrls.length,
      })
    );

    /*
     * In-app notification + push notification.
     * The Notification record guarantees a bell badge (and real-time chime /
     * desktop alert) even when mobile web push delivery drops a real-time SMS.
     */
    try {
      const who = contactName
        ? `${contactName}${customerName ? ` (${customerName})` : ''}`
        : customerName || normalizedFrom;

      const pushTitle =
        `${isMms ? 'New MMS' : 'New SMS'} from ${who}`;

      let pushBody = message.trim().substring(0, 200);

      if (!pushBody && mediaUrls.length === 1) {
        pushBody = 'Sent a photo';
      } else if (!pushBody && mediaUrls.length > 1) {
        pushBody = `Sent ${mediaUrls.length} photos`;
      } else if (pushBody && mediaUrls.length > 0) {
        pushBody = `📷 ${pushBody}`;
      }

      const deepLink = `/Messaging?phone=${normalizedFrom}`;

      // In-app notification — reliable fallback when push fails on mobile
      try {
        await base44.asServiceRole.entities.Notification.create({
          title: pushTitle,
          message: pushBody,
          type: 'new_message',
          link_url: deepLink,
          is_read: false,
        });
      } catch (notifError) {
        console.error(
          'In-app notification create failed:',
          notifError?.message || notifError
        );
      }

      // Push notification — mobile
      await sendPushToAllSubscriptions(base44, {
        title: pushTitle,
        body: pushBody,
        url: deepLink,
      });
    } catch (pushError) {
      console.error(
        'Push notification failed:',
        pushError?.message || pushError
      );
    }

    return Response.json({
      success: true,
      message_type: isMms ? 'mms' : 'sms',
      media_count: mediaUrls.length,
    });
  } catch (error) {
    console.error(
      'receiveVoipSms error:',
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