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

    const { estimateId, amount, method, date, note } = await req.json();

    if (!estimateId || amount === undefined || amount === null) {
      return Response.json({ error: "Missing estimateId or amount" }, { status: 400 });
    }

    // Fetch the estimate
    const estimates = await base44.entities.Estimate.filter({ id: estimateId });
    if (!estimates || estimates.length === 0) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = estimates[0];
    console.log(`[recordEstimatePayment] Recording payment of $${amount} for estimate ${estimate.estimate_number}`);

    // Add payment to the payments array
    const payments = estimate.payments || [];
    payments.push({
      amount: amount,
      method: method || "card",
      date: date || new Date().toISOString().split("T")[0],
      note: note || ""
    });

    // Check if deposit is now fully paid
    let depositPaid = estimate.deposit_paid || false;
    if (estimate.deposit_required && estimate.deposit_amount) {
      const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      if (totalPaid >= estimate.deposit_amount) {
        depositPaid = true;
      }
    }

    // Update estimate
    await base44.entities.Estimate.update(estimateId, {
      payments: payments,
      deposit_paid: depositPaid
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