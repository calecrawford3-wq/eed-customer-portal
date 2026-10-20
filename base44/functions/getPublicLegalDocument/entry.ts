import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { portalItems, portalCustomerId } from '../../shared/portalDocument.ts';
import { publicCapability } from '../../shared/publicCapability.ts';

export default async function(req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const { publicAccessToken, estimateId, invoiceId, customerEngineId } = await req.json();
    const ids = [estimateId, invoiceId, customerEngineId].filter(v => v !== undefined && v !== null);
    if (ids.some(v => typeof v !== 'string' || !v || v.length > 200)) return Response.json({ error: 'Invalid document reference' }, { status: 400 });
    let docs = [];
    if (publicAccessToken !== undefined) {
      if (!publicCapability(publicAccessToken)) return Response.json({ error: 'Invalid document link' }, { status: 400 });
      docs = portalItems(await base44.asServiceRole.entities.LegalDocument.filter({ public_access_token: publicAccessToken }));
    } else {
      if (!ids.length) return Response.json({ error: 'Document reference required' }, { status: 400 });
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
      const cid = user.role === 'admin' ? '' : await portalCustomerId(base44, user);
      if (user.role !== 'admin' && !cid) return Response.json({ error: 'Customer account required' }, { status: 403 });
      for (const [field, value] of [['estimate_id', estimateId], ['invoice_id', invoiceId], ['customer_engine_id', customerEngineId]]) {
        if (value) docs.push(...portalItems(await base44.asServiceRole.entities.LegalDocument.filter({ [field]: value, ...(cid ? { customer_id: cid } : {}) })));
      }
    }
    const unique = [...new Map(docs.filter(d => d.status !== 'void').map(d => [d.id, d])).values()];
    return Response.json({ legal_documents: unique.map(doc => ({
      id: doc.id, document_type: doc.document_type, title: doc.title, body: doc.body, status: doc.status,
      seal_tag_numbers: doc.seal_tag_numbers || null, seal_tag_photos: doc.seal_tag_photos || [],
      admin_signature: doc.admin_signature || null, admin_signed_at: doc.admin_signed_at || null,
      customer_signature: doc.customer_signature || null, customer_signed_at: doc.customer_signed_at || null,
      ...(publicAccessToken ? { public_access_token: publicAccessToken } : {}),
    })) }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return Response.json({ error: 'Unable to load legal document' }, { status: 500 }); }
}
