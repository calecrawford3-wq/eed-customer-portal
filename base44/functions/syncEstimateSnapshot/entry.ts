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

    if (!estimateId || !publicAccessToken) {
      return Response.json({ error: "Missing estimateId or publicAccessToken" }, { status: 400 });
    }

    // Fetch estimate and related data
    const estimates = await base44.entities.Estimate.filter({ id: estimateId });
    if (!estimates || estimates.length === 0) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = estimates[0];

    // Fetch customer
    const customers = await base44.entities.Customer.filter({ id: estimate.customer_id });
    const customer = customers?.[0];

    // Fetch app settings
    const settings = await base44.entities.AppSettings.filter({ key: "global" });
    const appSettings = settings?.[0] || {};

    // Build snapshot payload
    const snapshot = {
      public_access_token: publicAccessToken,
      estimate_number: estimate.estimate_number,
      customer_name: customer ? `${customer.first_name} ${customer.last_name}` : "",
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

    // Post to public app API
    const response = await fetch("https://elite-viewer.base44.app/api/sync-estimate-snapshot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(snapshot),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Public app sync failed:", errorData);
      return Response.json({ error: "Failed to sync snapshot to public app" }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Snapshot sync error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});