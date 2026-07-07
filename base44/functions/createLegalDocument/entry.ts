import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });

    const {
      document_type,
      title,
      body,
      estimate_id,
      invoice_id,
      customer_id,
      build_id,
      customer_engine_id,
      seal_tag_numbers,
      seal_tag_photos,
      admin_signature,
      admin_signed_at,
    } = await req.json();

    if (!document_type || !title || !customer_id) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Void any existing pending legal documents of the same type for this estimate/invoice
    if (estimate_id) {
      const existing = await base44.asServiceRole.entities.LegalDocument.filter({
        estimate_id, document_type, status: 'pending_customer'
      });
      for (const doc of existing || []) {
        await base44.asServiceRole.entities.LegalDocument.update(doc.id, { status: 'void' });
      }
    }
    if (invoice_id) {
      const existing = await base44.asServiceRole.entities.LegalDocument.filter({
        invoice_id, document_type, status: 'pending_customer'
      });
      for (const doc of existing || []) {
        await base44.asServiceRole.entities.LegalDocument.update(doc.id, { status: 'void' });
      }
    }

    // Void ALL existing active docs (pending or signed) for the same engine — newer agreement replaces the old one
    if (customer_engine_id) {
      const engineDocs = await base44.asServiceRole.entities.LegalDocument.filter({
        customer_engine_id, document_type
      });
      for (const doc of (engineDocs || []).filter(d => d.status !== 'void')) {
        await base44.asServiceRole.entities.LegalDocument.update(doc.id, { status: 'void' });
      }
    }

    const publicAccessToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    const hasAdminSig = !!admin_signature;
    const legalDocument = await base44.asServiceRole.entities.LegalDocument.create({
      document_type,
      title,
      body,
      customer_id,
      estimate_id: estimate_id || null,
      invoice_id: invoice_id || null,
      build_id: build_id || null,
      customer_engine_id: customer_engine_id || null,
      seal_tag_numbers: seal_tag_numbers || null,
      seal_tag_photos: seal_tag_photos || [],
      admin_signature: admin_signature || null,
      admin_signed_by: hasAdminSig ? user.id : null,
      admin_signed_at: admin_signed_at || null,
      customer_signature: null,
      customer_signed_at: null,
      status: 'pending_customer',
      public_access_token: publicAccessToken,
    });

    return Response.json({ success: true, legal_document: legalDocument });
  } catch (error) {
    console.error('Error creating legal document:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});