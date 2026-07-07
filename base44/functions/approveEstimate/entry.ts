import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Validate headers
    const authHeader = req.headers.get("Authorization");
    const syncSecret = req.headers.get("x-sync-secret");
    const syncApiKey = Deno.env.get("SYNC_API_KEY");
    const syncSecretEnv = Deno.env.get("SYNC_SECRET");

    if (authHeader !== `Bearer ${syncApiKey}` || syncSecret !== syncSecretEnv) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { public_access_token } = await req.json();

    if (!public_access_token) {
      return Response.json({ error: "Missing public_access_token" }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Find estimate by public_access_token using service role
    const estimates = await base44.asServiceRole.entities.Estimate.filter({ 
      public_access_token 
    });

    if (!estimates || estimates.length === 0) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = estimates[0];

    // Update status to approved
    await base44.asServiceRole.entities.Estimate.update(estimate.id, {
      status: "approved"
    });

    // Notify admin
    try {
      await base44.asServiceRole.functions.invoke("sendAdminNotification", {
        title: "Estimate Accepted",
        message: `Estimate ${estimate.estimate_number || estimate.id} was accepted by the customer.`,
        type: "estimate_accepted",
        link_url: `/EstimateDetail?id=${estimate.id}`,
      });
    } catch (e) {
      console.error("Notification failed:", e.message);
    }

    return Response.json({
      success: true,
      status: "approved",
      public_access_token
    });
  } catch (error) {
    console.error("Error in approveEstimate:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});