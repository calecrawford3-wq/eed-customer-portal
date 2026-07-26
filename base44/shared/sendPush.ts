import webpush from 'npm:web-push@3.6.7';

/**
 * Shared push notification helper — sends a web push to every subscribed device.
 * Used by sendAdminNotification (all major events), receiveVoipSms (inbound SMS),
 * and sendPushNotification (direct frontend test calls).
 *
 * @param base44  — a Base44 client with asServiceRole access
 * @param title   — notification title
 * @param body    — notification body text
 * @param url     — in-app route to open when the notification is tapped
 */
export async function sendPushToAllSubscriptions(base44, { title, body, url = '/Messaging' }) {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('[push] VAPID keys not configured — skipping push');
    return { sent: 0, failed: 0, cleaned: 0, configured: false };
  }

  webpush.setVapidDetails(
    'mailto:admin@enginedevelopment.com',
    vapidPublicKey,
    vapidPrivateKey
  );

  const subscriptions = await base44.asServiceRole.entities.PushSubscription.list('-created_date', 500);
  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0, cleaned: 0, configured: true };
  }

  const payload = JSON.stringify({ title, body, url });
  let sent = 0;
  let failed = 0;
  const staleIds = [];

  for (const sub of subscriptions) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
    };
    try {
      await webpush.sendNotification(pushSub, payload);
      sent++;
    } catch (err) {
      failed++;
      const statusCode = err?.statusCode || err?.status || 0;
      if (statusCode === 404 || statusCode === 410) {
        staleIds.push(sub.id);
      } else {
        console.error('[push] failed for', sub.endpoint, ':', err?.message || err);
      }
    }
  }

  for (const id of staleIds) {
    try { await base44.asServiceRole.entities.PushSubscription.delete(id); } catch (_) { /* ignore */ }
  }

  console.log(`[push] sent=${sent}, failed=${failed}, cleaned=${staleIds.length}`);
  return { sent, failed, cleaned: staleIds.length, configured: true };
}