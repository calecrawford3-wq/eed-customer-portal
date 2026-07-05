import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Validate x-sync-secret header (shared with viewer app)
    const incomingSecret = req.headers.get("x-sync-secret");
    const expectedSecret = Deno.env.get("SYNC_SECRET");
    if (!incomingSecret || incomingSecret !== expectedSecret) {
      console.log("[recordInvoicePayment] Secret mismatch - access denied");
      return Response.json({ error: "Forbidden: Invalid sync_secret" }, { status: 403 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json();
    console.log("[recordInvoicePayment] Body keys:", Object.keys(body).join(", "));

    const invoiceNumber = body.invoice_number;
    const publicAccessToken = body.public_access_token;
    const amount = body.amount_paid ?? body.amount;
    const stripeSessionId = body.stripe_session_id;
    const stripePaymentIntent = body.stripe_payment_intent;
    const paidAt = body.paid_at || new Date().toISOString().split("T")[0];

    if ((!invoiceNumber && !publicAccessToken) || !amount) {
      return Response.json({ error: "Missing invoice_number/public_access_token or amount" }, { status: 400 });
    }

    // Find the invoice by invoice_number (preferred) or public_access_token (fallback)
    let invoices;
    if (invoiceNumber) {
      invoices = await base44.asServiceRole.entities.Invoice.filter({ invoice_number: invoiceNumber });
    } else {
      invoices = await base44.asServiceRole.entities.Invoice.filter({ public_access_token: publicAccessToken });
    }

    const invoice = invoices?.[0];
    if (!invoice) {
      console.error(`[recordInvoicePayment] Invoice not found (number=${invoiceNumber}, token=${publicAccessToken})`);
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }

    console.log(`[recordInvoicePayment] Found invoice ${invoice.invoice_number} (${invoice.id})`);

    // Build the payment record
    const newPayment = {
      amount: amount,
      method: body.method || "card",
      note: body.note || `Stripe Payment - ${stripeSessionId || stripePaymentIntent || "N/A"}`,
      date: paidAt,
    };

    // Avoid duplicate payments from webhook retries — match on stripe reference in note
    const existingPayments = invoice.payments || [];
    if (stripeSessionId || stripePaymentIntent) {
      const ref = stripeSessionId || stripePaymentIntent;
      const dup = existingPayments.find(p => (p.note || "").includes(ref));
      if (dup) {
        console.log(`[recordInvoicePayment] Duplicate payment detected for ref ${ref} — skipping`);
        return Response.json({
          success: true,
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          duplicate: true,
          status: invoice.status,
        });
      }
    }

    const allPayments = [...existingPayments, newPayment];
    const totalPaid = allPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const balance = Math.max(0, (invoice.total || 0) - (Number(invoice.applied_credits) || 0) - totalPaid);
    const status = balance <= 0 ? "paid" : "partial";

    await base44.asServiceRole.entities.Invoice.update(invoice.id, {
      payments: allPayments,
      amount_paid: totalPaid,
      balance_due: balance,
      status,
    });

    console.log(`[recordInvoicePayment] Invoice updated — paid: ${totalPaid}, balance: ${balance}, status: ${status}`);

    return Response.json({
      success: true,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      amount_paid: totalPaid,
      balance_due: balance,
      status,
    });
  } catch (error) {
    console.error(`[recordInvoicePayment] Error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});