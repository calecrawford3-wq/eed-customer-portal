import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendPushToAllSubscriptions } from '../../shared/sendPush.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Require admin auth for direct frontend calls
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

    const result = await sendPushToAllSubscriptions(base44, {
      title,
      body: messageBody,
      url: url || '/Messaging',
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('sendPushNotification error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});