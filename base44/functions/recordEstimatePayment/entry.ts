import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Extract and validate sync_secret from x-sync-secret header
    const incomingSecret = req.headers.get("x-sync-secret");
    const expectedSecret = Deno.env.get("SYNC_SECRET");

    console.log(`[recordEstimatePayment] SYNC_SECRET exists: ${!!expectedSecret}`);
    console.log(`[recordEstimatePayment] x-sync-secret header exists: ${!!incomingSecret}`);
    
    if (!incomingSecret || incomingSecret !== expectedSecret) {
      console.log(`[recordEstimatePayment] Secret mismatch - access denied`);
      return Response.json({ error: "Forbidden: Invalid sync_secret" }, { status: 403 });
    }
    
    console.log(`[recordEstimatePayment] Secret validation passed`);

    const base44 = createClientFromRequest(req);
    const { estimateId, estimateNumber, publicAccessToken, amount, method, date, note, stripeSessionId } = await req.json();

    if (!amount || amount === undefined || amount === null) {
      return Response.json({ error: "Missing amount" }, { status: 400 });
    }

    // Find estimate by ID, estimate_number, or public_access_token
    let estimate;
    if (estimateId) {
      const estimates = await base44.asServiceRole.entities.Estimate.filter({ id: estimateId });
      estimate = estimates?.[0];
    } else if (estimateNumber) {
      const estimates = await base44.asServiceRole.entities.Estimate.filter({ estimate_number: estimateNumber });
      estimate = estimates?.[0];
    } else if (publicAccessToken) {
      const estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token: publicAccessToken });
      estimate = estimates?.[0];
    }

    if (!estimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    console.log(`[recordEstimatePayment] Recording payment of $${amount} for estimate ${estimate.estimate_number}`);

    // Add payment to the payments array
    const payments = estimate.payments || [];
    payments.push({
      amount: amount,
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

    // Update estimate
    await base44.asServiceRole.entities.Estimate.update(estimate.id, {
      payments: payments,
      deposit_paid: depositPaid,
      amount_paid: totalPaid
    });

    console.log(`[recordEstimatePayment] Payment recorded successfully`);

    return Response.json({ 
      success: true,
      deposit_paid: depositPaid
    });
  } catch (error) {
    console.error(`[recordEstimatePayment] Error: ${error.message}`);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});