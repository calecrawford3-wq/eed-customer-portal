import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { publicAccessToken, estimateId, invoiceId, customerEngineId } = await req.json();

    // Collect all non-void docs matching any provided identifier
    let allDocs = [];

    if (publicAccessToken) {
      const docs = await base44.asServiceRole.entities.LegalDocument.filter({ public_access_token: publicAccessToken });
      allDocs = (docs || []).filter(d => d.status !== 'void');
    } else {
      if (estimateId) {
        const docs = await base44.asServiceRole.entities.LegalDocument.filter({ estimate_id: estimateId });
        allDocs = allDocs.concat((docs || []).filter(d => d.status !== 'void'));
      }
      if (invoiceId) {
        const docs = await base44.asServiceRole.entities.LegalDocument.filter({ invoice_id: invoiceId });
        allDocs = allDocs.concat((docs || []).filter(d => d.status !== 'void'));
      }
      if (customerEngineId) {
        const docs = await base44.asServiceRole.entities.LegalDocument.filter({ customer_engine_id: customerEngineId });
        allDocs = allDocs.concat((docs || []).filter(d => d.status !== 'void'));
      }
      // Dedupe by id (an estimate + engine query may overlap)
      const seen = new Set();
      allDocs = allDocs.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
    }

    if (allDocs.length === 0) {
      return Response.json({ legal_documents: [] });
    }

    // Return safe public fields for every matching doc
    const legalDocuments = allDocs.map(doc => ({
      id: doc.id,
      document_type: doc.document_type,
      title: doc.title,
      body: doc.body,
      status: doc.status,
      seal_tag_numbers: doc.seal_tag_numbers || null,
      seal_tag_photos: doc.seal_tag_photos || [],
      admin_signature: doc.admin_signature || null,
      admin_signed_at: doc.admin_signed_at || null,
      customer_signature: doc.customer_signature || null,
      customer_signed_at: doc.customer_signed_at || null,
      public_access_token: doc.public_access_token,
    }));

    return Response.json({ legal_documents: legalDocuments });
  } catch (error) {
    console.error('Error fetching legal document:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});