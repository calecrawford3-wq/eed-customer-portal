import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { po_id } = await req.json();
    if (typeof po_id !== 'string' || !po_id || po_id.length > 200) return Response.json({ error: 'Invalid order' }, { status: 400 });
    const po = (await base44.asServiceRole.entities.PurchaseOrder.filter({ id: po_id }))?.[0];
    if (!po || !['draft', 'sent', 'acknowledged'].includes(po.status)) return Response.json({ error: 'Order unavailable for supplier updates' }, { status: 409 });
    const origin = new URL(Deno.env.get('PORTAL_BASE_URL') || 'https://portal.eedpower.com');
    if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('Invalid portal origin');
    const expires = Date.parse(po.supplier_token_expires_at);
    const token = po.supplier_access_token && expires > Date.now() + 86400000 ? po.supplier_access_token : crypto.randomUUID();
    if (token !== po.supplier_access_token) await base44.asServiceRole.entities.PurchaseOrder.update(po_id, {
      supplier_access_token: token, supplier_token_expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    });
    const url = new URL('/functions/acknowledgePO', origin.origin);
    url.searchParams.set('po_id', po_id); url.searchParams.set('token', token);
    return Response.json({ url: url.toString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Unable to prepare supplier link' }, { status: 500 }); }
});
