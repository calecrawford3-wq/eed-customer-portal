import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { publicAccessToken, documentId, customerSignature } = await req.json();

    if ((!publicAccessToken && !documentId) || typeof customerSignature !== 'string' ||
        !customerSignature.startsWith('data:image/png;base64,') || customerSignature.length > 2000000) {
      return Response.json({ error: 'Document and a valid PNG signature are required' }, { status: 400 });
    }

    // Portal signing uses the authenticated ownership link, never a token
    // exposed in the dashboard response. Existing emailed links stay supported.
    let customerId = null;
    if (documentId) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
      customerId = user.data?.customer_id || user.customer_id;
      if (!customerId || user.role === 'admin') return Response.json({ error: 'Customer account required' }, { status: 403 });
    }
    const result = await base44.asServiceRole.entities.LegalDocument.filter(
      documentId ? { id: documentId, customer_id: customerId } : { public_access_token: publicAccessToken }
    );
    const docs = result.items || result || [];
    if (docs.length === 0) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    const doc = docs[0];
    if (documentId && doc.customer_id !== customerId) return Response.json({ error: 'Document not found' }, { status: 404 });
    if (doc.status === 'pending_admin' || (doc.document_type === 'contract_engine' && !doc.admin_signature)) {
      return Response.json({ error: 'Awaiting shop signature' }, { status: 409 });
    }
    if (doc.status === 'fully_signed') {
      return Response.json({ error: 'Document already signed' }, { status: 400 });
    }
    if (doc.status === 'void') {
      return Response.json({ error: 'Document is void' }, { status: 400 });
    }

    const updated = await base44.asServiceRole.entities.LegalDocument.update(doc.id, {
      customer_signature: customerSignature,
      customer_signed_at: new Date().toISOString(),
      status: 'fully_signed',
    });

    // Notify admin
    try {
      await base44.asServiceRole.functions.invoke('sendAdminNotification', {
        title: 'Legal Document Signed',
        message: `Document "${doc.title}" was signed by the customer.`,
        type: 'other',
        link_url: doc.estimate_id ? `/EstimateDetail?id=${doc.estimate_id}` : `/InvoiceDetail?id=${doc.invoice_id}`,
      });
    } catch (e) {
      console.error('Notification failed:', e.message);
    }

    return Response.json({ success: true, legal_document: { id: updated.id, status: updated.status } });
  } catch (error) {
    console.error('Error signing legal document:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
