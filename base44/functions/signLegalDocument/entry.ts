import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { publicAccessToken, customerSignature } = await req.json();

    if (!publicAccessToken || !customerSignature) {
      return Response.json({ error: 'publicAccessToken and customerSignature are required' }, { status: 400 });
    }

    const docs = await base44.asServiceRole.entities.LegalDocument.filter({ public_access_token: publicAccessToken });
    if (!docs || docs.length === 0) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    const doc = docs[0];
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