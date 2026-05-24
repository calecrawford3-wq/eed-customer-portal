import Stripe from "npm:stripe@13.11.0";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!webhookSecret || !signature) {
      console.error("Missing webhook secret or signature");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate Stripe signature
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Handle payment success
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const base44 = createClientFromRequest(req);

      const documentType = session.metadata?.document_type;
      const documentId = session.metadata?.document_id;
      const amountPaid = session.amount_total / 100;

      if (!documentType || !documentId) {
        console.error("Missing document metadata in Stripe session");
        return Response.json({ success: false, error: "Missing metadata" }, { status: 400 });
      }

      try {
        const entityName = documentType === "estimate" ? "Estimate" : "Invoice";
        const doc = await base44.asServiceRole.entities[entityName].filter({ id: documentId });

        if (!doc || doc.length === 0) {
          console.error(`${entityName} not found: ${documentId}`);
          return Response.json({ success: false, error: "Document not found" }, { status: 404 });
        }

        const currentDoc = doc[0];
        const payment = {
          amount: amountPaid,
          method: "card",
          date: new Date().toISOString().split("T")[0],
          note: `Stripe payment - Session ${session.id}`,
        };

        const updatedPayments = [...(currentDoc.payments || []), payment];
        const totalPaid = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);

        let updateData = { payments: updatedPayments };

        if (documentType === "estimate") {
          const depositMet = !currentDoc.deposit_required || totalPaid >= (currentDoc.deposit_amount || 0);
          updateData.deposit_paid = depositMet;
        } else {
          const balanceDue = Math.max(0, (currentDoc.total || 0) - totalPaid);
          const status = balanceDue <= 0 ? "paid" : "partial";
          updateData.amount_paid = totalPaid;
          updateData.balance_due = balanceDue;
          updateData.status = status;
        }

        await base44.asServiceRole.entities[entityName].update(documentId, updateData);
        console.log(`${entityName} ${documentId} updated with payment of $${amountPaid}`);

        return Response.json({ success: true });
      } catch (error) {
        console.error(`Error processing ${documentType} payment:`, error.message);
        return Response.json({ success: false, error: error.message }, { status: 500 });
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});