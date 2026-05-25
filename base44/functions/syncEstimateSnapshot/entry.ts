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

    const { estimateId, publicAccessToken } = await req.json();

    console.log(`[syncEstimateSnapshot] Starting sync for estimate ${estimateId} with token ${publicAccessToken}`);

    if (!estimateId || !publicAccessToken) {
      return Response.json({ error: "Missing estimateId or publicAccessToken" }, { status: 400 });
    }

    // Fetch estimate and related data
    const estimates = await base44.entities.Estimate.filter({ id: estimateId });
    if (!estimates || estimates.length === 0) {
      console.error(`[syncEstimateSnapshot] Estimate not found: ${estimateId}`);
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = estimates[0];
    console.log(`[syncEstimateSnapshot] Fetched estimate: ${estimate.estimate_number}`);

    // Fetch customer
    const customers = await base44.entities.Customer.filter({ id: estimate.customer_id });
    const customer = customers?.[0];
    console.log(`[syncEstimateSnapshot] Fetched customer: ${customer?.first_name} ${customer?.last_name}`);

    // Fetch app settings
    const settings = await base44.entities.AppSettings.filter({ key: "global" });
    const appSettings = settings?.[0] || {};
    console.log(`[syncEstimateSnapshot] Fetched app settings`);

    // Build snapshot payload
    const snapshot = {
      public_access_token: publicAccessToken,
      estimate_number: estimate.estimate_number,
      customer_name: customer ? `${customer.first_name} ${customer.last_name}` : "",
      customer_email: customer?.email || "",
      status: estimate.status,
      issue_date: estimate.issue_date,
      expiry_date: estimate.expiry_date,
      line_items: estimate.line_items || [],
      subtotal: estimate.subtotal,
      tax_amount: estimate.tax_amount,
      tax_rate: estimate.tax_rate,
      total: estimate.total,
      stripe_checkout_url: estimate.stripe_checkout_url,
      company_name: appSettings.company_name,
      company_logo_url: appSettings.company_logo_url,
      company_phone: appSettings.company_phone,
      company_address: appSettings.company_address,
    };

    // Validate payload
    const hasPublicToken = !!snapshot.public_access_token;
    const hasEstimateNumber = !!snapshot.estimate_number;
    const hasTotal = snapshot.total !== undefined && snapshot.total !== null;
    console.log(`[syncEstimateSnapshot] Payload validation - public_access_token: ${hasPublicToken}, estimate_number: ${hasEstimateNumber}, total: ${hasTotal}`);

    // Get sync credentials
    const syncSecret = Deno.env.get("SYNC_SECRET");
    const syncApiKey = Deno.env.get("SYNC_API_KEY");
    const destinationUrl = "https://elite-viewer.base44.app/api/functions/syncEstimateSnapshot";

    // Verify secrets exist
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

      // Build viewer app link
      const estimateViewerLink = `https://elite-viewer.base44.app/estimate/${publicAccessToken}`;
      console.log("Snapshot synced successfully");
      console.log("Viewer link:", estimateViewerLink);
      
      return Response.json({ 
        success: true, 
        viewerLink: estimateViewerLink 
      });
    } catch (fetchError) {
      console.error("SYNC ERROR MESSAGE:", fetchError.message);
      console.error("SYNC ERROR TYPE:", fetchError.constructor?.name);
      console.error("Full error:", fetchError);
      throw fetchError;
    }
  } catch (error) {
    console.error("CAUGHT ERROR MESSAGE:", error.message);
    console.error("CAUGHT ERROR TYPE:", error.constructor?.name);
    return Response.json({ 
      error: `Snapshot sync error: ${error.message}`
    }, { status: 500 });
  }
});