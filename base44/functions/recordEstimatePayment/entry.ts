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

    // SERVICE ROLE ACCESS TEST (validate pattern)
    console.log(`[recordEstimatePayment] SERVICE ROLE TEST START`);
    const base44 = createClientFromRequest(req);
    
    try {
      const testEstimates = await base44.asServiceRole.entities.Estimate.list(1);
      console.log(`[recordEstimatePayment] SERVICE ROLE TEST - Success: true, Estimates returned: ${testEstimates?.length || 0}`);
    } catch (testError) {
      console.error(`[recordEstimatePayment] SERVICE ROLE TEST FAILED - ${testError.message}`);
      return Response.json({
        test: "SERVICE_ROLE_ACCESS_TEST",
        success: false,
        errorMessage: testError.message
      }, { status: 500 });
    }

    // STEP 1: Parse request body
    console.log(`[recordEstimatePayment] STEP 1: Parsing request body`);
    const body = await req.json();
    console.log(`[recordEstimatePayment] Body keys:`, Object.keys(body).join(", "));

    // STEP 2: Resolve values
    console.log(`[recordEstimatePayment] STEP 2: Resolving values`);
    const publicAccessToken = body.public_access_token;
    const amount = body.amount_paid ?? body.amount;
    const stripeSessionId = body.stripe_session_id;
    const stripePaymentIntent = body.stripe_payment_intent;
    const paymentStatus = body.payment_status;
    const paidAt = body.paid_at;
    const customerEmail = body.customer_email;

    console.log(`[recordEstimatePayment] STEP 3: Log resolved values`);
    console.log(`  - publicAccessToken: ${publicAccessToken}`);
    console.log(`  - amount: ${amount}`);
    console.log(`  - stripeSessionId: ${stripeSessionId}`);
    console.log(`  - stripePaymentIntent: ${stripePaymentIntent}`);
    console.log(`  - paymentStatus: ${paymentStatus}`);
    console.log(`  - paidAt: ${paidAt}`);
    console.log(`  - customerEmail: ${customerEmail}`);

    // Validate required fields
    if (!publicAccessToken || !amount) {
      console.error(`[recordEstimatePayment] Missing required fields: publicAccessToken=${!!publicAccessToken}, amount=${!!amount}`);
      return Response.json({ error: "Missing publicAccessToken or amount" }, { status: 400 });
    }

    // STEP 4: Find Estimate using public_access_token
    console.log(`[recordEstimatePayment] STEP 4: Finding Estimate by public_access_token`);
    let estimates;
    try {
      estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token: publicAccessToken });
    } catch (filterError) {
      console.error(`[recordEstimatePayment] Filter error: ${filterError.message}`);
      return Response.json({ error: "Failed to find estimate" }, { status: 500 });
    }

    const estimate = estimates?.[0];
    console.log(`[recordEstimatePayment] STEP 5: Estimate found: ${!!estimate}, Estimate ID: ${estimate?.id || "N/A"}`);

    if (!estimate) {
      console.error(`[recordEstimatePayment] No estimate found with token: ${publicAccessToken}`);
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    // STEP 6: Create payment record (valid Payment fields)
    console.log(`[recordEstimatePayment] STEP 6: Creating payment record`);
    const newPayment = {
      amount: amount,
      method: body.method || "card",
      note: body.note || `Stripe Payment - ${stripeSessionId || stripePaymentIntent || "N/A"}`,
      date: paidAt || new Date().toISOString().split("T")[0]
    };
    console.log(`[recordEstimatePayment] STEP 7: Payment record created:`);
    console.log(`  - Amount: $${newPayment.amount}`);
    console.log(`  - Method: ${newPayment.method}`);
    console.log(`  - Date: ${newPayment.date}`);
    console.log(`  - Note: ${newPayment.note}`);

    // STEP 7: Update Estimate with new payment
    console.log(`[recordEstimatePayment] STEP 8: Updating Estimate`);
    const existingPayments = estimate.payments || [];
    const updatedPayments = [...existingPayments, newPayment];
    
    // Calculate total paid
    const totalPaid = updatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    // Determine new status
    let newStatus = estimate.status;
    let depositPaid = estimate.deposit_paid || false;
    
    if (estimate.deposit_required && estimate.deposit_amount) {
      if (totalPaid >= estimate.deposit_amount) {
        depositPaid = true;
      }
    }

    // If fully paid, mark as approved
    if (estimate.total && totalPaid >= estimate.total) {
      newStatus = "approved";
    }

    // Update Estimate (valid fields only)
    try {
      await base44.asServiceRole.entities.Estimate.update(estimate.id, {
        payments: updatedPayments,
        amount_paid: totalPaid,
        deposit_paid: depositPaid,
        status: newStatus
      });
      console.log(`[recordEstimatePayment] STEP 9: Estimate updated - status: ${newStatus}, amount_paid: ${totalPaid}, deposit_paid: ${depositPaid}`);
    } catch (updateError) {
      console.error(`[recordEstimatePayment] Update error: ${updateError.message}`);
      return Response.json({ error: "Failed to update estimate" }, { status: 500 });
    }

    // STEP 8: Return success
    console.log(`[recordEstimatePayment] STEP 10: Payment recorded successfully`);
    return Response.json({
      success: true,
      estimate_id: estimate.id,
      estimate_number: estimate.estimate_number,
      amount_paid: totalPaid,
      deposit_paid: depositPaid,
      status: newStatus
    });

  } catch (error) {
    console.error(`[recordEstimatePayment] Outer error: ${error.message}`);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});