import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import webpush from 'npm:web-push@3.6.7';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow both service-role calls (from receiveVoipSms) and admin user calls
    const isAuthenticated = await base44.auth.isAuthenticated();
    if (!isAuthenticated) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await base44.auth.me();
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { title, body: messageBody, phone, url } = body;

    if (!title || !messageBody) {
      return Response.json({ error: 'Missing title or body' }, { status: 400 });
    }

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured');
      return Response.json({ error: 'Push not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets' }, { status: 500 });
    }

    webpush.setVapidDetails(
      'mailto:admin@enginedevelopment.com',
      vapidPublicKey,
      vapidPrivateKey
    );

    // Get all push subscriptions
    const subscriptions = await base44.asServiceRole.entities.PushSubscription.list('-created_date', 500);

    if (!subscriptions || subscriptions.length === 0) {
      return Response.json({ success: true, sent: 0, failed: 0, message: 'No subscriptions registered' });
    }

    const payload = JSON.stringify({
      title,
      body: messageBody,
      phone: phone || '',
      url: url || '/Messaging',
    });

    let sent = 0;
    let failed = 0;
    const staleIds: string[] = [];

    for (const sub of subscriptions) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh_key,
          auth: sub.auth_key,
        },
      };

      try {
        await webpush.sendNotification(pushSub, payload);
        sent++;
      } catch (err: any) {
        failed++;
        const statusCode = err?.statusCode || err?.status || 0;
        // 404/410 = subscription is no longer valid, clean it up
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
        }
        // Don't log every failure (could be noisy with expired subscriptions)
        if (statusCode !== 404 && statusCode !== 410) {
          console.error('Push failed for', sub.endpoint, ':', err?.message || err);
        }
      }
    }

    // Clean up stale subscriptions
    for (const id of staleIds) {
      try {
        await base44.asServiceRole.entities.PushSubscription.delete(id);
      } catch (_) { /* ignore */ }
    }

    console.log(`sendPushNotification: sent=${sent}, failed=${failed}, cleaned=${staleIds.length}`);
    return Response.json({ success: true, sent, failed, cleaned: staleIds.length });
  } catch (error) {
    console.error('sendPushNotification error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});