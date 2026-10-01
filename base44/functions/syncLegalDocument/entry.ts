import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== "admin") {
      return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { legalDocumentId } = await req.json();

    if (!legalDocumentId) {
      return Response.json({ error: "Missing legalDocumentId" }, { status: 400 });
    }

    const docs = await base44.entities.LegalDocument.filter({ id: legalDocumentId });
    if (!docs || docs.length === 0) {
      return Response.json({ error: "Legal document not found" }, { status: 404 });
    }

    const doc = docs[0];
    console.log(`[syncLegalDocument] Syncing document: ${doc.title} (token: ${doc.public_access_token})`);

    // Look up the parent estimate/invoice public_access_token so the viewer can link this doc
    let estimate_public_access_token = null;
    let invoice_public_access_token = null;
    if (doc.estimate_id) {
      try {
        const est = await base44.asServiceRole.entities.Estimate.get(doc.estimate_id);
        estimate_public_access_token = est?.public_access_token || null;
      } catch (e) {
        console.log(`[syncLegalDocument] Could not fetch estimate ${doc.estimate_id}: ${e.message}`);
      }
    }
    if (doc.invoice_id) {
      try {
        const inv = await base44.asServiceRole.entities.Invoice.get(doc.invoice_id);
        invoice_public_access_token = inv?.public_access_token || null;
      } catch (e) {
        console.log(`[syncLegalDocument] Could not fetch invoice ${doc.invoice_id}: ${e.message}`);
      }
    }

    // Convert seal_tag_numbers from comma-separated string to array
    let sealTagArray = [];
    if (doc.seal_tag_numbers) {
      sealTagArray = doc.seal_tag_numbers
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0);
    }

    const payload = {
      public_access_token: doc.public_access_token,
      estimate_public_access_token,
      invoice_public_access_token,
      document_type: doc.document_type || "illegal_parts",
      title: doc.title,
      body: doc.body,
      customer_id: doc.customer_id || null,
      estimate_id: doc.estimate_id || null,
      invoice_id: doc.invoice_id || null,
      build_id: doc.build_id || null,
      customer_engine_id: doc.customer_engine_id || null,
      seal_tag_numbers: sealTagArray,
      seal_tag_photos: doc.seal_tag_photos || [],
      admin_signature: doc.admin_signature || null,
      admin_signed_at: doc.admin_signed_at || null,
      admin_signed_by: doc.admin_signed_by || null,
      customer_signature: doc.customer_signature || null,
      customer_signed_at: doc.customer_signed_at || null,
      status: doc.status || "pending_customer",
    };

    const syncSecret = Deno.env.get("SYNC_SECRET");
    const syncApiKey = Deno.env.get("SYNC_API_KEY");
    const destinationUrl = "https://billing.eedpower.com/api/functions/syncLegalDocument";

    if (!syncSecret || !syncApiKey) {
      console.error("[syncLegalDocument] Missing SYNC_SECRET or SYNC_API_KEY");
      return Response.json({ error: "Missing SYNC_SECRET or SYNC_API_KEY" }, { status: 500 });
    }

    const response = await fetch(destinationUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${syncApiKey}`,
        "x-sync-secret": syncSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.text();
    console.log(`[syncLegalDocument] Response status: ${response.status}, body: ${responseBody}`);

    if (!response.ok) {
      console.error("[syncLegalDocument] Sync failed:", response.status, responseBody);
      return Response.json({
        error: `Public app sync failed - Status ${response.status}`,
        details: responseBody,
      }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[syncLegalDocument] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});