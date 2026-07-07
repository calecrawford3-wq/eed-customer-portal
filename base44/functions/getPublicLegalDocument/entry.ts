import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { publicAccessToken, estimateId } = await req.json();

    let doc = null;

    if (publicAccessToken) {
      const docs = await base44.asServiceRole.entities.LegalDocument.filter({ public_access_token: publicAccessToken });
      doc = docs?.[0] || null;
    } else if (estimateId) {
      const docs = await base44.asServiceRole.entities.LegalDocument.filter({
        estimate_id: estimateId, document_type: 'illegal_parts'
      });
      // Find the most recent non-void one
      doc = (docs || []).find(d => d.status !== 'void') || null;
    }

    if (!doc) {
      return Response.json({ legal_document: null });
    }

    // Return safe public fields
    return Response.json({
      legal_document: {
        id: doc.id,
        document_type: doc.document_type,
        title: doc.title,
        body: doc.body,
        status: doc.status,
        admin_signature: doc.admin_signature,
        admin_signed_at: doc.admin_signed_at,
        customer_signature: doc.customer_signature,
        customer_signed_at: doc.customer_signed_at,
        public_access_token: doc.public_access_token,
      },
    });
  } catch (error) {
    console.error('Error fetching legal document:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});