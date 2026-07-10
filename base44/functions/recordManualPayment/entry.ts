import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Validate x-sync-secret header (same auth as recordEstimatePayment)
    const incomingSecret = req.headers.get("x-sync-secret");
    const expectedSecret = Deno.env.get("SYNC_SECRET");

    if (!incomingSecret || incomingSecret !== expectedSecret) {
      console.log("[recordManualPayment] Secret mismatch - access denied");
      return Response.json({ error: "Forbidden: Invalid sync_secret" }, { status: 403 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json();
    console.log("[recordManualPayment] Body keys:", Object.keys(body).join(", "));

    // Validate required fields
    const { public_access_token, document_type, payment_method, amount } = body;

    if (!public_access_token || !document_type || !payment_method || amount == null) {
      return Response.json({
        error: "Missing required fields: public_access_token, document_type, payment_method, amount"
      }, { status: 400 });
    }

    if (!["estimate", "invoice"].includes(document_type)) {
      return Response.json({ error: "document_type must be 'estimate' or 'invoice'" }, { status: 400 });
    }

    if (!["cash", "check"].includes(payment_method)) {
      return Response.json({ error: "payment_method must be 'cash' or 'check'" }, { status: 400 });
    }

    if (payment_method === "check" && !body.check_number) {
      return Response.json({ error: "check_number is required for check payments" }, { status: 400 });
    }

    // Resolve the linked document by public_access_token to capture IDs
    let estimateId = null;
    let invoiceId = null;
    let customerId = null;
    let documentNumber = body.document_number || null;

    if (document_type === "estimate") {
      const estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token });
      const estimate = estimates?.[0];
      if (estimate) {
        estimateId = estimate.id;
        customerId = estimate.customer_id;
        if (!documentNumber) documentNumber = estimate.estimate_number;
      }
    } else {
      const invoices = await base44.asServiceRole.entities.Invoice.filter({ public_access_token });
      const invoice = invoices?.[0];
      if (invoice) {
        invoiceId = invoice.id;
        customerId = invoice.customer_id;
        estimateId = invoice.estimate_id || null;
        if (!documentNumber) documentNumber = invoice.invoice_number;
      }
    }

    // Store the pending manual payment
    const record = await base44.asServiceRole.entities.ManualPayment.create({
      public_access_token,
      document_type,
      document_number: documentNumber,
      estimate_id: estimateId,
      invoice_id: invoiceId,
      customer_id: customerId,
      payment_method,
      amount: Number(amount),
      check_number: body.check_number || null,
      delivery_method: body.delivery_method || null,
      mail_tracking_number: body.mail_tracking_number || null,
      customer_name: body.customer_name || null,
      customer_email: body.customer_email || null,
      status: "pending",
      submitted_at: body.submitted_at || new Date().toISOString(),
      notes: body.notes || null,
    });

    console.log(`[recordManualPayment] Pending ${payment_method} payment stored: ${record.id} for ${document_type} ${documentNumber}`);

    // Notify admin that a manual payment is coming
    try {
      const label = payment_method === "check"
        ? `check #${body.check_number || "?"}`
        : "cash";
      const delivery = body.delivery_method === "mail"
        ? ` (mailed${body.mail_tracking_number ? ` — tracking ${body.mail_tracking_number}` : ""})`
        : body.delivery_method === "drop_off" ? " (drop-off)" : "";
      await base44.asServiceRole.functions.invoke("sendAdminNotification", {
        title: "Manual Payment Pending",
        message: `A ${label} payment of $${Number(amount).toFixed(2)}${delivery} is pending for ${document_type} ${documentNumber || public_access_token}.`,
        type: "other",
        link_url: invoiceId ? `/InvoiceDetail?id=${invoiceId}` : (estimateId ? `/EstimateDetail?id=${estimateId}` : null),
      });
    } catch (e) {
      console.error("[recordManualPayment] Admin notification failed:", e.message);
    }

    return Response.json({
      success: true,
      id: record.id,
      status: "pending",
      document_type,
      document_number: documentNumber,
      estimate_id: estimateId,
      invoice_id: invoiceId,
    });

  } catch (error) {
    console.error(`[recordManualPayment] Error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});