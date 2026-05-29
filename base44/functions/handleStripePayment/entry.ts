import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import Stripe from "npm:stripe@14.0.0";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("[handleStripePayment] STRIPE_WEBHOOK_SECRET not set");
      return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    const signature = req.headers.get("stripe-signature");
    const body = await req.text();

    // Validate Stripe webhook signature
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      console.error("[handleStripePayment] Webhook signature verification failed:", err.message);
      return Response.json({ error: "Invalid signature" }, { status: 403 });
    }

    console.log(`[handleStripePayment] Received event: ${event.type}`);

    // Only process checkout.session.completed events
    if (event.type !== "checkout.session.completed") {
      console.log(`[handleStripePayment] Ignoring event type: ${event.type}`);
      return Response.json({ received: true });
    }

    const session = event.data.object;
    const metadata = session.metadata || {};
    
    const publicAccessToken = metadata.public_access_token;
    const estimateNumber = metadata.estimate_number;

    if (!publicAccessToken) {
      console.error("[handleStripePayment] No public_access_token in metadata");
      return Response.json({ error: "Missing public_access_token in metadata" }, { status: 400 });
    }

    console.log(`[handleStripePayment] Processing payment for estimate: ${estimateNumber || publicAccessToken}`);

    // Use service-role access for entity operations
    const base44 = createClientFromRequest(req);
    console.log(`[handleStripePayment] About to lookup Estimate by public_access_token`);

    const estimates = await base44.asServiceRole.entities.Estimate.filter({ 
      public_access_token: publicAccessToken 
    });
    const estimate = estimates?.[0];

    if (!estimate) {
      console.error(`[handleStripePayment] Estimate not found for token: ${publicAccessToken}`);
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    console.log(`[handleStripePayment] Found estimate: ${estimate.estimate_number}`);

    // Extract payment amount from Stripe session
    const amountPaid = session.amount_total ? session.amount_total / 100 : 0; // Stripe uses cents
    const paymentMethod = "card";
    const paymentDate = new Date().toISOString().split("T")[0];

    // Add payment to payments array
    const payments = estimate.payments || [];
    payments.push({
      amount: amountPaid,
      method: paymentMethod,
      date: paymentDate,
      note: `Stripe payment - Session: ${session.id}`
    });

    // Calculate total amount paid
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Determine status and deposit status
    let depositPaid = estimate.deposit_paid || false;
    let estimateStatus = estimate.status;

    if (estimate.deposit_required && estimate.deposit_amount) {
      if (totalPaid >= estimate.deposit_amount) {
        depositPaid = true;
      }
    }

    // Mark as fully paid if amount matches total
    if (estimate.total && totalPaid >= estimate.total) {
      estimateStatus = "approved"; // or "paid" if that's a valid status
    }

    console.log(`[handleStripePayment] Updating estimate - amount_paid: ${totalPaid}, depositPaid: ${depositPaid}`);

    // Update estimate with payment information
    await base44.asServiceRole.entities.Estimate.update(estimate.id, {
      payments: payments,
      amount_paid: totalPaid,
      deposit_paid: depositPaid,
      status: estimateStatus
    });

    console.log(`[handleStripePayment] Payment recorded successfully for estimate: ${estimate.estimate_number}`);

    return Response.json({ 
      received: true,
      estimate_id: estimate.id,
      amount_paid: totalPaid,
      deposit_paid: depositPaid
    });
  } catch (error) {
    console.error(`[handleStripePayment] Error: ${error.message}`);
    console.error(`[handleStripePayment] Stack: ${error.stack}`);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});