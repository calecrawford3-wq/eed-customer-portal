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

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, documentId, amount, description } = await req.json();

    if (!type || !documentId || !amount || amount <= 0) {
      return Response.json({ error: "Missing or invalid parameters" }, { status: 400 });
    }

    const appId = Deno.env.get("BASE44_APP_ID");
    const origin = req.headers.get("origin") || "http://localhost:5173";

    const metadata = {
      base44_app_id: appId,
      document_type: type,
      document_id: documentId,
      user_email: user.email,
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: description,
              metadata,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/${type === "estimate" ? "EstimateViewer" : "InvoiceViewer"}?id=${documentId}&payment=success`,
      cancel_url: `${origin}/${type === "estimate" ? "EstimateViewer" : "InvoiceViewer"}?id=${documentId}`,
      metadata,
    });

    return Response.json({ session_id: session.id, client_secret: session.client_secret });
  } catch (error) {
    console.error("Stripe error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});