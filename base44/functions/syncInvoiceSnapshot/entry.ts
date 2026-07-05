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

    const { invoiceId, publicAccessToken } = await req.json();

    console.log(`[syncInvoiceSnapshot] Starting sync for invoice ${invoiceId} with token ${publicAccessToken}`);

    if (!invoiceId || !publicAccessToken) {
      return Response.json({ error: "Missing invoiceId or publicAccessToken" }, { status: 400 });
    }

    // Fetch invoice
    const invoices = await base44.entities.Invoice.filter({ id: invoiceId });
    if (!invoices || invoices.length === 0) {
      console.error(`[syncInvoiceSnapshot] Invoice not found: ${invoiceId}`);
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }

    const inv = invoices[0];
    console.log(`[syncInvoiceSnapshot] Fetched invoice: ${inv.invoice_number}`);

    // Fetch customer
    const customers = await base44.entities.Customer.filter({ id: inv.customer_id });
    const customer = customers?.[0];
    console.log(`[syncInvoiceSnapshot] Fetched customer: ${customer?.first_name} ${customer?.last_name}`);

    // Fetch app settings
    const settings = await base44.entities.AppSettings.filter({ key: "global" });
    const appSettings = settings?.[0] || {};
    console.log(`[syncInvoiceSnapshot] Fetched app settings`);

    // Fetch engine details if linked
    let engineSerial = null;
    let enginePlatform = null;
    let eedEngineId = null;
    let buildStage = null;

    const STAGE_LABELS = { stock: "Stock", stage_1: "Stage 1", stage_2: "Stage 2", stage_3: "Stage 3", contract: "Contract", custom: "Custom" };

    if (inv.customer_engine_id) {
      try {
        const engines = await base44.entities.CustomerEngine.filter({ id: inv.customer_engine_id });
        const engine = engines?.[0];
        if (engine) {
          engineSerial = engine.engine_serial_number || null;
          eedEngineId = engine.eed_id || null;
          buildStage = engine.current_stage || null;

          if (engine.platform_id) {
            const platforms = await base44.entities.EnginePlatform.filter({ id: engine.platform_id });
            const platform = platforms?.[0];
            if (platform) {
              enginePlatform = `${platform.manufacturer} ${platform.name}${platform.year_range_start ? ` (${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"})` : ""}`;
            }
          }
        }
      } catch (e) {
        console.warn(`[syncInvoiceSnapshot] Could not fetch engine details: ${e.message}`);
      }
    }

    // If build is linked, get stage
    if (inv.build_id) {
      try {
        const builds = await base44.entities.EngineBuild.filter({ id: inv.build_id });
        const build = builds?.[0];
        if (build) {
          if (!engineSerial) engineSerial = build.engine_serial_number || null;
          if (!eedEngineId) eedEngineId = build.eed_id || null;
        }
      } catch (e) {
        console.warn(`[syncInvoiceSnapshot] Could not fetch build details: ${e.message}`);
      }
    }

    // Build snapshot payload — all fields needed for viewing + payments
    const snapshot = {
      public_access_token: publicAccessToken,
      invoice_number: inv.invoice_number,
      customer_name: customer ? `${customer.first_name} ${customer.last_name}` : "",
      customer_email: customer?.email || "",
      customer_company: customer?.company_name || "",
      customer_address_line1: customer?.address_line1 || "",
      customer_address_line2: customer?.address_line2 || "",
      customer_city: customer?.city || "",
      customer_state: customer?.state || "",
      customer_zip: customer?.zip || "",
      status: inv.status,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      line_items: inv.line_items || [],
      labor_items: inv.labor_items || [],
      machining_items: inv.machining_items || [],
      payments: inv.payments || [],
      subtotal: inv.subtotal,
      tax_amount: inv.tax_amount,
      tax_rate: inv.tax_rate,
      total: inv.total,
      applied_credits: inv.applied_credits || 0,
      amount_paid: inv.amount_paid || 0,
      amount_due: inv.amount_due,
      balance_due: inv.balance_due,
      stripe_checkout_url: inv.stripe_checkout_url,
      notes: inv.notes || "",
      // Company info
      company_name: appSettings.company_name,
      company_logo_url: appSettings.company_logo_url,
      company_phone: appSettings.company_phone,
      company_address: appSettings.company_address,
      company_email: appSettings.company_email,
      // Engine fields
      engine_serial_number: engineSerial || null,
      engine_platform: enginePlatform || null,
      eed_id: eedEngineId || null,
      build_stage: buildStage ? (STAGE_LABELS[buildStage] || buildStage) : null,
    };

    // Validate payload
    const hasPublicToken = !!snapshot.public_access_token;
    const hasInvoiceNumber = !!snapshot.invoice_number;
    const hasTotal = snapshot.total !== undefined && snapshot.total !== null;
    console.log(`[syncInvoiceSnapshot] Payload validation - public_access_token: ${hasPublicToken}, invoice_number: ${hasInvoiceNumber}, total: ${hasTotal}`);

    // Get sync credentials
    const syncSecret = Deno.env.get("SYNC_SECRET");
    const syncApiKey = Deno.env.get("SYNC_API_KEY");
    const destinationUrl = "https://elite-viewer.base44.app/api/functions/syncInvoiceSnapshot";

    console.log("SYNC_SECRET exists:", !!syncSecret);
    console.log("SYNC_API_KEY exists:", !!syncApiKey);
    console.log("Destination URL:", destinationUrl);

    if (!syncSecret || !syncApiKey) {
      console.error("Missing SYNC_SECRET or SYNC_API_KEY");
      return Response.json({
        error: "Missing SYNC_SECRET or SYNC_API_KEY"
      }, { status: 500 });
    }

    try {
      console.log("Starting fetch to:", destinationUrl);
      const response = await fetch(destinationUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${syncApiKey}`,
          "x-sync-secret": syncSecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(snapshot),
      });

      const responseBody = await response.text();

      console.log("Response status:", response.status);
      console.log("Response body:", responseBody);

      if (!response.ok) {
        console.error("SYNC ERROR STATUS:", response.status);
        console.error("SYNC ERROR BODY:", responseBody);

        return Response.json({
          error: `Public app sync failed - Status ${response.status}`,
          details: {
            destination_url: destinationUrl,
            response_status: response.status,
            response_body: responseBody,
          }
        }, { status: 500 });
      }

      const invoiceViewerLink = `https://elite-viewer.base44.app/invoice/${publicAccessToken}`;
      console.log("Invoice snapshot synced successfully");
      console.log("Viewer link:", invoiceViewerLink);

      return Response.json({
        success: true,
        viewerLink: invoiceViewerLink
      });
    } catch (fetchError) {
      console.error("SYNC ERROR MESSAGE:", fetchError.message);
      console.error("SYNC ERROR TYPE:", fetchError.constructor?.name);
      throw fetchError;
    }
  } catch (error) {
    console.error("CAUGHT ERROR MESSAGE:", error.message);
    console.error("CAUGHT ERROR TYPE:", error.constructor?.name);
    return Response.json({
      error: `Invoice snapshot sync error: ${error.message}`
    }, { status: 500 });
  }
});