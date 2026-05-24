import Stripe from "npm:stripe@13.11.0";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

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

    const { type, documentId, amount, description, publicAccessToken, customerEmail } = await req.json();

    if (!type || !documentId || !amount || amount <= 0 || !publicAccessToken || !customerEmail) {
      return Response.json({ error: "Missing or invalid parameters" }, { status: 400 });
    }

    const appId = Deno.env.get("BASE44_APP_ID");
    const origin = "https://checkout.stripe.com"; // Stripe hosted checkout

    const metadata = {
      base44_app_id: appId,
      document_type: type,
      document_id: documentId,
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
      success_url: `${req.headers.get("origin")}/public/${type === "estimate" ? "estimate" : "invoice"}/${publicAccessToken}?payment=success`,
      cancel_url: `${req.headers.get("origin")}/public/${type === "estimate" ? "estimate" : "invoice"}/${publicAccessToken}`,
      customer_email: customerEmail,
      metadata,
    });

    return Response.json({ 
      checkout_url: `https://checkout.stripe.com/pay/${session.id}`,
      session_id: session.id 
    });
  } catch (error) {
    console.error("Stripe error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});