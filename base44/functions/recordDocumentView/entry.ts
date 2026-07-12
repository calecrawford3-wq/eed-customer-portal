import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Validate SYNC_API_KEY Bearer token
    const authHeader = req.headers.get("authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const expectedApiKey = Deno.env.get("SYNC_API_KEY");
    if (!bearerToken || !expectedApiKey || bearerToken !== expectedApiKey) {
      console.log("[recordDocumentView] Invalid API key - access denied");
      return Response.json({ error: "Forbidden: Invalid API key" }, { status: 403 });
    }

    // Validate x-sync-secret header
    const incomingSecret = req.headers.get("x-sync-secret");
    const expectedSecret = Deno.env.get("SYNC_SECRET");
    if (!incomingSecret || !expectedSecret || incomingSecret !== expectedSecret) {
      console.log("[recordDocumentView] Secret mismatch - access denied");
      return Response.json({ error: "Forbidden: Invalid sync_secret" }, { status: 403 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { public_access_token, document_type, customer_name, customer_email, user_agent } = body;
    const viewed_at = body.viewed_at || new Date().toISOString();

    if (!public_access_token || !document_type) {
      return Response.json({ error: "Missing required fields: public_access_token, document_type" }, { status: 400 });
    }
    if (!["estimate", "invoice"].includes(document_type)) {
      return Response.json({ error: "document_type must be 'estimate' or 'invoice'" }, { status: 400 });
    }

    const isFirstView = (doc) => !doc.first_viewed_at;
    const logFirstView = (docNumber) => {
      console.log(`[recordDocumentView] First view — ${document_type} ${docNumber} by ${customer_email || customer_name || "unknown"} | UA: ${(user_agent || "").slice(0, 120)}`);
    };

    if (document_type === "estimate") {
      const estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token });
      const estimate = estimates?.[0];
      if (!estimate) {
        return Response.json({ error: "Estimate not found" }, { status: 404 });
      }
      const firstViewedAt = estimate.first_viewed_at || viewed_at;
      const viewCount = (estimate.view_count || 0) + 1;
      if (isFirstView(estimate)) logFirstView(estimate.estimate_number || estimate.id);
      await base44.asServiceRole.entities.Estimate.update(estimate.id, {
        first_viewed_at: firstViewedAt,
        last_viewed_at: viewed_at,
        view_count: viewCount,
      });
      console.log(`[recordDocumentView] Estimate ${estimate.estimate_number || estimate.id} viewed (count: ${viewCount})`);
      return Response.json({
        success: true,
        document_type: "estimate",
        document_number: estimate.estimate_number || body.document_number || null,
        first_viewed_at: firstViewedAt,
        last_viewed_at: viewed_at,
        view_count: viewCount,
      });
    }

    // invoice
    const invoices = await base44.asServiceRole.entities.Invoice.filter({ public_access_token });
    const invoice = invoices?.[0];
    if (!invoice) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }
    const firstViewedAt = invoice.first_viewed_at || viewed_at;
    const viewCount = (invoice.view_count || 0) + 1;
    if (isFirstView(invoice)) logFirstView(invoice.invoice_number || invoice.id);
    await base44.asServiceRole.entities.Invoice.update(invoice.id, {
      first_viewed_at: firstViewedAt,
      last_viewed_at: viewed_at,
      view_count: viewCount,
    });
    console.log(`[recordDocumentView] Invoice ${invoice.invoice_number || invoice.id} viewed (count: ${viewCount})`);
    return Response.json({
      success: true,
      document_type: "invoice",
      document_number: invoice.invoice_number || body.document_number || null,
      first_viewed_at: firstViewedAt,
      last_viewed_at: viewed_at,
      view_count: viewCount,
    });

  } catch (error) {
    console.error(`[recordDocumentView] Error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});