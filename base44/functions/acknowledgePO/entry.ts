import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function page(title: string, message: string, status = 200, fields?: Record<string, string>) {
  const form = fields ? `<form method="post">${Object.entries(fields).map(([k,v]) => `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`).join('')}<button type="submit">${fields.action === 'ready' ? 'Confirm order ready' : 'Confirm acknowledgment'}</button></form>` : '';
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:16px system-ui;background:#f8fafc;color:#0f172a;margin:0;padding:24px;display:grid;min-height:85vh;place-items:center}main{box-sizing:border-box;background:white;padding:32px;border-radius:16px;width:100%;max-width:480px;text-align:center;overflow-wrap:anywhere}p{line-height:1.6;color:#475569}button{background:#0f172a;color:white;border:0;border-radius:8px;padding:16px;font:inherit;width:100%;cursor:pointer}footer{margin-top:32px;color:#64748b}</style><main><h1>${escape(title)}</h1><p>${escape(message)}</p>${form}<footer>Elite Engine Development</footer></main></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", 'X-Content-Type-Options': 'nosniff' },
  });
}

Deno.serve(async req => {
  if (!['GET', 'POST'].includes(req.method)) return page('Invalid request', 'Use the link in your order email.', 405);
  try {
    const url = new URL(req.url);
    const params = req.method === 'POST' ? new URLSearchParams(await req.text()) : url.searchParams;
    const poId = params.get('po_id') || '';
    const token = params.get('token') || '';
    const action = params.get('action') || 'acknowledge';
    if (!poId || poId.length > 200 || !token || token.length > 512 || !['acknowledge', 'ready'].includes(action)) return page('Invalid link', 'Please request a new link from the shop.', 400);
    const base44 = createClientFromRequest(req);
    const po = (await base44.asServiceRole.entities.PurchaseOrder.filter({ id: poId }))?.[0];
    // Transitional support for old emails only. Minting a new token retires the old link.
    // Disable globally before public launch, after outstanding suppliers receive new links.
    const legacy = po && !po.supplier_access_token && !po.supplier_token_expires_at && Deno.env.get('ALLOW_LEGACY_PO_LINKS') !== 'false';
    const valid = po && (po.supplier_access_token
      ? token === po.supplier_access_token && Number.isFinite(Date.parse(po.supplier_token_expires_at)) && Date.parse(po.supplier_token_expires_at) > Date.now()
      : legacy && token === btoa(`${poId}:${po.po_number}`).replace(/=/g, ''));
    if (!valid) return page('Link unavailable', 'This link is invalid or expired. Please contact the shop.', 403);
    const next = action === 'ready' ? 'ready' : 'acknowledged';
    const eligible = action === 'ready' ? ['sent', 'acknowledged'] : ['sent'];
    if (!eligible.includes(po.status)) return page('No update needed', 'This order has already advanced or is no longer accepting supplier updates.');
    if (req.method === 'GET') return page('Confirm order update', `Purchase order ${po.po_number}. ${action === 'ready' ? 'Confirm the items are ready for pickup or shipment.' : 'Confirm you have received and accepted this order.'}`, 200, { po_id: poId, token, action });
    const match: Record<string, unknown> = { id: poId, status: po.status, updated_date: po.updated_date };
    if (po.supplier_access_token) { match.supplier_access_token = token; match.supplier_token_expires_at = po.supplier_token_expires_at; }
    const result = await base44.asServiceRole.entities.PurchaseOrder.updateMany(match, { $set: { status: next } });
    if (result?.updated !== 1) return page('Order changed', 'The shop updated this order. Reopen your link to check the current status.', 409);
    try {
      await base44.asServiceRole.functions.invoke('sendAdminNotification', { title: action === 'ready' ? 'Purchase Order Ready' : 'Purchase Order Acknowledged', message: `Supplier updated PO ${po.po_number} to ${next}.`, type: action === 'ready' ? 'po_ready' : 'po_accepted', link_url: `/PurchaseOrderDetail?id=${encodeURIComponent(poId)}` });
    } catch { console.error('PO supplier notification failed'); }
    return page('Thank you', `Purchase order ${po.po_number} is now ${next === 'ready' ? 'ready for pickup or shipment' : 'acknowledged'}.`);
  } catch {
    console.error('Supplier order update failed');
    return page('Unable to update order', 'Please try again or contact the shop.', 500);
  }
});
