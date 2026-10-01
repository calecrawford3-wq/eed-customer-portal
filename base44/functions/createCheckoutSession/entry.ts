import Stripe from "npm:stripe@13.11.0";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const { type, publicAccessToken, amount, description } = await req.json();

    if (!type || !publicAccessToken || !amount || amount <= 0) {
      return Response.json({ error: "Missing or invalid parameters" }, { status: 400 });
    }

    // Fetch document using service role to validate token and get customer info
    let document, customer;
    
    if (type === "estimate") {
      const estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token: publicAccessToken });
      if (!estimates || estimates.length === 0) {
        return Response.json({ error: "Estimate not found" }, { status: 404 });
      }
      document = estimates[0];
      const customers = await base44.asServiceRole.entities.Customer.filter({ id: document.customer_id });
      customer = customers[0];
    } else if (type === "invoice") {
      const invoices = await base44.asServiceRole.entities.Invoice.filter({ public_access_token: publicAccessToken });
      if (!invoices || invoices.length === 0) {
        return Response.json({ error: "Invoice not found" }, { status: 404 });
      }
      document = invoices[0];
      const customers = await base44.asServiceRole.entities.Customer.filter({ id: document.customer_id });
      customer = customers[0];
    } else {
      return Response.json({ error: "Invalid document type" }, { status: 400 });
    }

    if (!document || !customer) {
      return Response.json({ error: "Document or customer not found" }, { status: 404 });
    }

    const appId = Deno.env.get("BASE44_APP_ID");
    const PUBLIC_VIEWER_URL = "https://billing.eedpower.com";

    const metadata = {
      base44_app_id: appId,
      document_type: type,
      document_id: document.id,
      customer_email: customer.email,
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
      success_url: `${PUBLIC_VIEWER_URL}/${type === "estimate" ? "estimate" : "invoice"}/${publicAccessToken}?payment=success`,
      cancel_url: `${PUBLIC_VIEWER_URL}/${type === "estimate" ? "estimate" : "invoice"}/${publicAccessToken}`,
      metadata,
    });

    return Response.json({ session_id: session.id, client_secret: session.client_secret });
  } catch (error) {
    console.error("Stripe error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});