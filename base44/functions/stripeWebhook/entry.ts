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

        if (documentType === "estimate") {
          // Convert estimate to invoice — payment goes on the invoice, not the estimate
          let invoiceId = currentDoc.invoice_id;
          let invoice = null;
          if (invoiceId) {
            const invs = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
            invoice = invs?.[0] || null;
          }

          const allPayments = [...(currentDoc.payments || []), payment];
          const totalPaid = allPayments.reduce((s, p) => s + (p.amount || 0), 0);

          if (invoice) {
            const invPayments = [...(invoice.payments || []), payment];
            const invPaid = invPayments.reduce((s, p) => s + (p.amount || 0), 0);
            const invBalance = Math.max(0, (invoice.total || 0) - (Number(invoice.applied_credits) || 0) - invPaid);
            const invStatus = invBalance <= 0 ? "paid" : "partial";
            await base44.asServiceRole.entities.Invoice.update(invoice.id, {
              payments: invPayments,
              amount_paid: invPaid,
              balance_due: invBalance,
              status: invStatus,
            });
          } else {
            const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
            const newInvoice = await base44.asServiceRole.entities.Invoice.create({
              invoice_number: invoiceNumber,
              estimate_id: currentDoc.id,
              customer_id: currentDoc.customer_id,
              customer_engine_id: currentDoc.customer_engine_id || "",
              build_id: currentDoc.build_id || "",
              status: totalPaid >= (currentDoc.total || 0) ? "paid" : "partial",
              issue_date: new Date().toISOString().split("T")[0],
              line_items: currentDoc.line_items || [],
              labor_items: currentDoc.labor_items || [],
              machining_items: currentDoc.machining_items || [],
              subtotal: currentDoc.subtotal,
              tax_rate: currentDoc.tax_rate,
              tax_amount: currentDoc.tax_amount,
              total: currentDoc.total,
              applied_credits: currentDoc.applied_credits || 0,
              amount_paid: totalPaid,
              balance_due: Math.max(0, (currentDoc.total || 0) - (Number(currentDoc.applied_credits) || 0) - totalPaid),
              notes: currentDoc.notes || "",
              payments: allPayments,
            });
            invoiceId = newInvoice.id;
          }

          let depositPaid = currentDoc.deposit_paid || false;
          if (currentDoc.deposit_required && currentDoc.deposit_amount && totalPaid >= currentDoc.deposit_amount) {
            depositPaid = true;
          }

          await base44.asServiceRole.entities.Estimate.update(documentId, {
            invoice_id: invoiceId,
            status: "approved",
            deposit_paid: depositPaid,
            payments: [],
            amount_paid: 0,
          });
          console.log(`Estimate ${documentId} converted to invoice — payment: $${amountPaid}`);
        } else {
          // Invoice payment — add directly to invoice
          const updatedPayments = [...(currentDoc.payments || []), payment];
          const totalPaid = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
          const balanceDue = Math.max(0, (currentDoc.total || 0) - (Number(currentDoc.applied_credits) || 0) - totalPaid);
          const status = balanceDue <= 0 ? "paid" : "partial";
          await base44.asServiceRole.entities.Invoice.update(documentId, {
            payments: updatedPayments,
            amount_paid: totalPaid,
            balance_due: balanceDue,
            status,
          });
          console.log(`Invoice ${documentId} updated with payment of $${amountPaid}`);
        }

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