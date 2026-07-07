import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Authenticate server-to-server call from the public viewer app
    const syncSecret = Deno.env.get("SYNC_SECRET");
    const syncApiKey = Deno.env.get("SYNC_API_KEY");

    if (!syncSecret || !syncApiKey) {
      console.error("[recordLegalDocumentSignature] Missing SYNC_SECRET or SYNC_API_KEY");
      return Response.json({ error: "Server not configured for sync" }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization");
    const providedSecret = req.headers.get("x-sync-secret");

    if (authHeader !== `Bearer ${syncApiKey}` || providedSecret !== syncSecret) {
      console.error("[recordLegalDocumentSignature] Authentication failed");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { customer_signature, customer_signed_at, estimate_number, estimate_id, public_access_token } = body;

    if (!customer_signature) {
      return Response.json({ error: "customer_signature is required" }, { status: 400 });
    }

    // Find the LegalDocument — try public_access_token first, then estimate_id, then estimate_number
    let docs = [];

    if (public_access_token) {
      docs = await base44.asServiceRole.entities.LegalDocument.filter({
        public_access_token,
        document_type: "illegal_parts",
      });
    }

    if ((!docs || docs.length === 0) && estimate_id) {
      docs = await base44.asServiceRole.entities.LegalDocument.filter({
        estimate_id,
        document_type: "illegal_parts",
      });
    }

    if ((!docs || docs.length === 0) && estimate_number) {
      // Look up the estimate by estimate_number to get its ID
      const estimates = await base44.asServiceRole.entities.Estimate.filter({
        estimate_number,
      });
      if (estimates && estimates.length > 0) {
        docs = await base44.asServiceRole.entities.LegalDocument.filter({
          estimate_id: estimates[0].id,
          document_type: "illegal_parts",
        });
      }
    }

    if (!docs || docs.length === 0) {
      console.error("[recordLegalDocumentSignature] No legal document found");
      return Response.json({ error: "Legal document not found" }, { status: 404 });
    }

    // Use the most recent non-void document
    const activeDocs = docs.filter((d) => d.status !== "void");
    const doc = activeDocs[0] || docs[0];

    if (doc.status === "fully_signed") {
      return Response.json({ success: true, message: "Document already signed", legal_document_id: doc.id });
    }

    const signedAt = customer_signed_at || new Date().toISOString();

    const updated = await base44.asServiceRole.entities.LegalDocument.update(doc.id, {
      customer_signature,
      customer_signed_at: signedAt,
      status: "fully_signed",
    });

    console.log(`[recordLegalDocumentSignature] Updated document ${doc.id} — status: fully_signed`);

    // Notify admin
    try {
      await base44.asServiceRole.functions.invoke("sendAdminNotification", {
        title: "Illegal Parts Acknowledgment Signed",
        message: `Customer signed the Illegal Parts Acknowledgment${estimate_number ? ` for ${estimate_number}` : ""}.`,
        type: "other",
        link_url: doc.estimate_id ? `/EstimateDetail?id=${doc.estimate_id}` : `/InvoiceDetail?id=${doc.invoice_id}`,
      });
    } catch (e) {
      console.error("[recordLegalDocumentSignature] Notification failed:", e.message);
    }

    return Response.json({
      success: true,
      legal_document_id: updated.id,
      status: updated.status,
    });
  } catch (error) {
    console.error("[recordLegalDocumentSignature] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});