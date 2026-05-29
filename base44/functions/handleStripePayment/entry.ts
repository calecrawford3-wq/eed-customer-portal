import Stripe from "npm:stripe@14.10.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const signature = req.headers.get("stripe-signature");
    const body = await req.text();

    if (!signature || !webhookSecret) {
      console.error("[handleStripePayment] Missing signature or webhook secret");
      return Response.json({ error: "Missing signature or secret" }, { status: 400 });
    }

    // Validate Stripe webhook signature
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error(`[handleStripePayment] Webhook signature verification failed: ${err.message}`);
      return Response.json({ error: "Signature verification failed" }, { status: 403 });
    }

    console.log(`[handleStripePayment] Received event: ${event.type}`);

    // Only process checkout.session.completed
    if (event.type !== "checkout.session.completed") {
      console.log(`[handleStripePayment] Ignoring event type: ${event.type}`);
      return Response.json({ received: true });
    }

    const session = event.data.object;
    const metadata = session.metadata || {};

    const { public_access_token, estimate_number, estimate_id, customer_name, total } = metadata;

    console.log(`[handleStripePayment] Processing payment for estimate: ${estimate_number}`);

    if (!public_access_token) {
      console.error("[handleStripePayment] Missing public_access_token in metadata");
      return Response.json({ error: "Missing public_access_token" }, { status: 400 });
    }

    // Create service-role client (no request-based auth)
    // For Deno/external webhooks, we use the SDK with environment context only
    const { createServiceRoleClient } = await import("npm:@base44/sdk@0.8.25");
    const base44 = createServiceRoleClient({
      appId: Deno.env.get("BASE44_APP_ID"),
      serviceRole: true
    });

    // Find estimate by public_access_token
    console.log("[handleStripePayment] About to lookup Estimate by public_access_token");
    const estimates = await base44.entities.Estimate.filter({ public_access_token });
    const estimate = estimates?.[0];

    if (!estimate) {
      console.error(`[handleStripePayment] Estimate not found for token: ${public_access_token}`);
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    console.log(`[handleStripePayment] Found estimate: ${estimate.estimate_number} (ID: ${estimate.id})`);

    // Extract payment details from Stripe session
    const amountPaid = session.amount_total ? session.amount_total / 100 : 0; // Stripe amounts are in cents
    const paymentIntentId = session.payment_intent || null;
    const customerEmail = session.customer_email || customer_name || null;
    const paymentDate = new Date().toISOString().split("T")[0];

    // Add payment to payments array
    const payments = estimate.payments || [];
    payments.push({
      amount: amountPaid,
      method: "card",
      date: paymentDate,
      note: `Stripe Session: ${session.id}`
    });

    // Calculate total paid
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const estimateTotal = estimate.total || 0;

    // Determine status
    let depositPaid = estimate.deposit_paid || false;
    let paymentStatus = "partial";

    if (estimate.deposit_required && estimate.deposit_amount) {
      if (totalPaid >= estimate.deposit_amount) {
        depositPaid = true;
      }
    }

    // If payment is full amount, mark as fully paid
    if (totalPaid >= estimateTotal) {
      paymentStatus = "paid";
    } else if (totalPaid > 0) {
      paymentStatus = "partial";
    }

    console.log(`[handleStripePayment] Payment: $${amountPaid}, Total Paid: $${totalPaid}, Status: ${paymentStatus}`);

    // Update estimate
    await base44.entities.Estimate.update(estimate.id, {
      payments: payments,
      deposit_paid: depositPaid,
      amount_paid: totalPaid,
      stripe_session_id: session.id,
      stripe_payment_intent: paymentIntentId
    });

    console.log(`[handleStripePayment] Estimate updated successfully`);

    // Return 200 to Stripe immediately
    return Response.json({ 
      success: true,
      estimate_id: estimate.id,
      amount_paid: amountPaid,
      total_paid: totalPaid,
      deposit_paid: depositPaid
    });

  } catch (error) {
    console.error(`[handleStripePayment] Error: ${error.message}`);
    console.error(error.stack);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});