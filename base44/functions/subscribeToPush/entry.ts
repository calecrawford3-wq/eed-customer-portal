import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { endpoint, p256dh, auth, user_agent } = body;

    if (!endpoint || !p256dh || !auth) {
      return Response.json({ error: 'Missing subscription fields' }, { status: 400 });
    }

    // Check if subscription already exists for this endpoint (dedupe)
    const existing = await base44.asServiceRole.entities.PushSubscription.filter({ endpoint });
    if (existing && existing.length > 0) {
      // Update user_id in case it's a different user on the same device
      await base44.asServiceRole.entities.PushSubscription.update(existing[0].id, {
        user_id: user.id,
        user_agent: user_agent || existing[0].user_agent,
      });
      return Response.json({ success: true, updated: true });
    }

    await base44.asServiceRole.entities.PushSubscription.create({
      endpoint,
      p256dh_key: p256dh,
      auth_key: auth,
      user_id: user.id,
      user_agent: user_agent || '',
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('subscribeToPush error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});