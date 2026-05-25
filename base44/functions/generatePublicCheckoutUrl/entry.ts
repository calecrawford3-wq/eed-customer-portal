import Stripe from "npm:stripe@13.11.0";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const { publicAccessToken, amount, description, customerEmail } = await req.json();

    if (!publicAccessToken || !amount || amount <= 0 || !description || !customerEmail) {
      return Response.json({ error: "Missing or invalid parameters" }, { status: 400 });
    }

    // Validate public token and fetch estimate (service role—no user auth needed)
    const estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token: publicAccessToken });

    if (!estimates || estimates.length === 0) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = estimates[0];

    // Only allow checkout if estimate is approved or sent
    if (!["sent", "approved"].includes(estimate.status)) {
      return Response.json({ error: `Checkout not available for status "${estimate.status}"` }, { status: 400 });
    }

    // Validate amount matches deposit or total
    const validAmount = estimate.deposit_required ? estimate.deposit_amount : estimate.total;
    if (Math.abs(amount - validAmount) > 0.01) {
      return Response.json({ error: "Amount does not match estimate total or deposit" }, { status: 400 });
    }

    const appId = Deno.env.get("BASE44_APP_ID");
    const origin = req.headers.get("origin") || "https://race-engine-specs.base44.app";

    const metadata = {
      base44_app_id: appId,
      public_access_token: publicAccessToken,
      estimate_id: estimate.id,
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: description,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/public/estimate/${publicAccessToken}?payment=success`,
      cancel_url: `${origin}/public/estimate/${publicAccessToken}`,
      customer_email: customerEmail,
      metadata,
    });

    return Response.json({ 
      checkout_url: `https://checkout.stripe.com/pay/${session.id}`,
      session_id: session.id 
    });
  } catch (error) {
    console.error("Stripe public checkout error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});