import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Validate x-sync-secret header
    const incomingSecret = req.headers.get("x-sync-secret");
    const expectedSecret = Deno.env.get("SYNC_SECRET");

    console.log(`[recordEstimatePayment] SYNC_SECRET exists: ${!!expectedSecret}`);
    console.log(`[recordEstimatePayment] x-sync-secret header exists: ${!!incomingSecret}`);
    
    if (!incomingSecret || incomingSecret !== expectedSecret) {
      console.log(`[recordEstimatePayment] Secret mismatch - access denied`);
      return Response.json({ error: "Forbidden: Invalid sync_secret" }, { status: 403 });
    }
    
    console.log(`[recordEstimatePayment] Secret validation passed`);

    const { publicAccessToken, amount, amount_paid, method, date, note, stripeSessionId } = await req.json();

    // Accept either amount or amount_paid
    const paymentAmount = amount || amount_paid;
    if (!paymentAmount || paymentAmount === undefined || paymentAmount === null) {
      return Response.json({ error: "Missing amount or amount_paid" }, { status: 400 });
    }

    // Find estimate by public_access_token
    if (!publicAccessToken) {
      return Response.json({ error: "Missing publicAccessToken" }, { status: 400 });
    }

    console.log(`[recordEstimatePayment] About to use service-role Estimate lookup`);
    const base44 = createClientFromRequest(req);
    
    let estimates;
    try {
      console.log(`[recordEstimatePayment] Calling base44.asServiceRole.entities.Estimate.filter with token: ${publicAccessToken}`);
      estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token: publicAccessToken });
      console.log(`[recordEstimatePayment] Filter successful, found ${estimates?.length || 0} estimates`);
    } catch (filterError) {
      console.error(`[recordEstimatePayment] Entity filter error: ${filterError.message}`);
      console.error(`[recordEstimatePayment] Error details:`, JSON.stringify(filterError, null, 2));
      throw filterError;
    }

    const estimate = estimates?.[0];

    if (!estimate) {
      console.error(`[recordEstimatePayment] No estimate found with token: ${publicAccessToken}`);
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    console.log(`[recordEstimatePayment] Recording payment of $${paymentAmount} for estimate ${estimate.estimate_number}`);

    // Add payment to the payments array
    const payments = estimate.payments || [];
    payments.push({
      amount: paymentAmount,
      method: method || "card",
      date: date || new Date().toISOString().split("T")[0],
      note: note || ""
    });

    // Calculate total amount paid
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Check if deposit is now fully paid
    let depositPaid = estimate.deposit_paid || false;
    if (estimate.deposit_required && estimate.deposit_amount) {
      if (totalPaid >= estimate.deposit_amount) {
        depositPaid = true;
      }
    }

    // Update estimate using service-role access
    await base44.asServiceRole.entities.Estimate.update(estimate.id, {
      payments: payments,
      deposit_paid: depositPaid,
      amount_paid: totalPaid
    });

    console.log(`[recordEstimatePayment] Payment recorded successfully`);

    return Response.json({ 
      success: true,
      estimate_id: estimate.id,
      deposit_paid: depositPaid,
      amount_paid: totalPaid
    });
  } catch (error) {
    console.error(`[recordEstimatePayment] Error: ${error.message}`);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});