import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Validate x-sync-secret header
    const incomingSecret = req.headers.get("x-sync-secret");
    const expectedSecret = Deno.env.get("SYNC_SECRET");

    console.log(`[recordEstimatePayment] SYNC_SECRET exists: ${!!expectedSecret}`);
    console.log(`[recordEstimatePayment] x-sync-secret header exists: ${!!incomingSecret}`);
    
    if (!incomingSecret || incomingSecret !== expectedSecret) {
      console.log(`[recordEstimatePayment] Secret mismatch - access denied`);
      return Response.json({ error: "Forbidden: Invalid sync_secret" }, { status: 403 });
    }
    
    console.log(`[recordEstimatePayment] Secret validation passed`);

    // SERVICE ROLE ACCESS TEST (validate pattern)
    console.log(`[recordEstimatePayment] SERVICE ROLE TEST START`);
    const base44 = createClientFromRequest(req);
    
    try {
      const testEstimates = await base44.asServiceRole.entities.Estimate.list(1);
      console.log(`[recordEstimatePayment] SERVICE ROLE TEST - Success: true, Estimates returned: ${testEstimates?.length || 0}`);
    } catch (testError) {
      console.error(`[recordEstimatePayment] SERVICE ROLE TEST FAILED - ${testError.message}`);
      return Response.json({
        test: "SERVICE_ROLE_ACCESS_TEST",
        success: false,
        errorMessage: testError.message
      }, { status: 500 });
    }

    // STEP 1: Parse request body
    console.log(`[recordEstimatePayment] STEP 1: Parsing request body`);
    const body = await req.json();
    console.log(`[recordEstimatePayment] Body keys:`, Object.keys(body).join(", "));

    // STEP 2: Resolve values
    console.log(`[recordEstimatePayment] STEP 2: Resolving values`);
    const publicAccessToken = body.public_access_token;
    const amount = body.amount_paid ?? body.amount;
    const stripeSessionId = body.stripe_session_id;
    const stripePaymentIntent = body.stripe_payment_intent;
    const paymentStatus = body.payment_status;
    const paidAt = body.paid_at;
    const customerEmail = body.customer_email;

    console.log(`[recordEstimatePayment] STEP 3: Log resolved values`);
    console.log(`  - publicAccessToken: ${publicAccessToken}`);
    console.log(`  - amount: ${amount}`);
    console.log(`  - stripeSessionId: ${stripeSessionId}`);
    console.log(`  - stripePaymentIntent: ${stripePaymentIntent}`);
    console.log(`  - paymentStatus: ${paymentStatus}`);
    console.log(`  - paidAt: ${paidAt}`);
    console.log(`  - customerEmail: ${customerEmail}`);

    // Validate required fields
    if (!publicAccessToken || !amount) {
      console.error(`[recordEstimatePayment] Missing required fields: publicAccessToken=${!!publicAccessToken}, amount=${!!amount}`);
      return Response.json({ error: "Missing publicAccessToken or amount" }, { status: 400 });
    }

    // STEP 4: Find Estimate using public_access_token
    console.log(`[recordEstimatePayment] STEP 4: Finding Estimate by public_access_token`);
    let estimates;
    try {
      estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token: publicAccessToken });
    } catch (filterError) {
      console.error(`[recordEstimatePayment] Filter error: ${filterError.message}`);
      return Response.json({ error: "Failed to find estimate" }, { status: 500 });
    }

    const estimate = estimates?.[0];
    console.log(`[recordEstimatePayment] STEP 5: Estimate found: ${!!estimate}, Estimate ID: ${estimate?.id || "N/A"}`);

    if (!estimate) {
      console.error(`[recordEstimatePayment] No estimate found with token: ${publicAccessToken}`);
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    // STEP 6: Create payment record
    const newPayment = {
      amount: amount,
      method: body.method || "card",
      note: body.note || `Stripe Payment - ${stripeSessionId || stripePaymentIntent || "N/A"}`,
      date: paidAt || new Date().toISOString().split("T")[0]
    };

    // Check if invoice already exists for this estimate
    let invoiceId = estimate.invoice_id;
    let invoice = null;
    if (invoiceId) {
      const invoices = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
      invoice = invoices?.[0] || null;
    }

    const allPayments = [...(estimate.payments || []), newPayment];
    const totalPaid = allPayments.reduce((s, p) => s + (p.amount || 0), 0);

    if (invoice) {
      // Add new payment to existing invoice
      const invPayments = [...(invoice.payments || []), newPayment];
      const invPaid = invPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const invBalance = Math.max(0, (invoice.total || 0) - (Number(invoice.applied_credits) || 0) - invPaid);
      const invStatus = invBalance <= 0 ? "paid" : "partial";
      await base44.asServiceRole.entities.Invoice.update(invoice.id, {
        payments: invPayments,
        amount_paid: invPaid,
        balance_due: invBalance,
        status: invStatus,
      });
      console.log(`[recordEstimatePayment] Payment added to existing invoice ${invoice.invoice_number}`);
    } else {
      // Create new invoice with all payments — payment goes on the invoice, not the estimate
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const newInvoice = await base44.asServiceRole.entities.Invoice.create({
        invoice_number: invoiceNumber,
        estimate_id: estimate.id,
        customer_id: estimate.customer_id,
        customer_engine_id: estimate.customer_engine_id || "",
        build_id: estimate.build_id || "",
        status: totalPaid >= (estimate.total || 0) ? "paid" : "partial",
        issue_date: new Date().toISOString().split("T")[0],
        // Engine-build invoices: balance is due on build completion, not 30 days
        due_on_completion: !!estimate.is_engine_build,
        due_date: estimate.is_engine_build ? "" : undefined,
        line_items: estimate.line_items || [],
        labor_items: estimate.labor_items || [],
        machining_items: estimate.machining_items || [],
        subtotal: estimate.subtotal,
        tax_rate: estimate.tax_rate,
        tax_amount: estimate.tax_amount,
        total: estimate.total,
        applied_credits: estimate.applied_credits || 0,
        amount_paid: totalPaid,
        balance_due: Math.max(0, (estimate.total || 0) - (Number(estimate.applied_credits) || 0) - totalPaid),
        public_access_token: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        notes: estimate.notes || "",
        payments: allPayments,
      });
      invoiceId = newInvoice.id;
      console.log(`[recordEstimatePayment] New invoice created: ${invoiceNumber} (${invoiceId})`);

      // Link legal documents from the estimate to the new invoice + engine
      if (estimate.contains_illegal_parts) {
        try {
          const legalDocs = await base44.asServiceRole.entities.LegalDocument.filter({
            estimate_id: estimate.id, document_type: "illegal_parts"
          });
          for (const doc of (legalDocs || []).filter(d => d.status !== "void")) {
            await base44.asServiceRole.entities.LegalDocument.update(doc.id, {
              invoice_id: invoiceId,
              customer_engine_id: estimate.customer_engine_id || doc.customer_engine_id || null,
            });
          }
          console.log(`[recordEstimatePayment] Linked ${legalDocs?.length || 0} legal doc(s) to invoice ${invoiceId}`);
        } catch (e) {
          console.warn("[recordEstimatePayment] Failed to link legal docs to invoice:", e.message);
        }
      }
    }

    // Calculate deposit status
    let depositPaid = estimate.deposit_paid || false;
    if (estimate.deposit_required && estimate.deposit_amount && totalPaid >= estimate.deposit_amount) {
      depositPaid = true;
    }

    // Update estimate: link invoice, clear payments, set approved
    await base44.asServiceRole.entities.Estimate.update(estimate.id, {
      invoice_id: invoiceId,
      status: "approved",
      deposit_paid: depositPaid,
      payments: [],
      amount_paid: 0,
    });
    console.log(`[recordEstimatePayment] Estimate updated — status: approved, invoice_id: ${invoiceId}, deposit_paid: ${depositPaid}`);

    // Notify admin of payment received
    try {
      await base44.asServiceRole.functions.invoke("sendAdminNotification", {
        title: "Payment Received",
        message: `A payment of $${Number(amount).toFixed(2)} was received for estimate ${estimate.estimate_number || estimate.id}.`,
        type: "payment_received",
        link_url: `/InvoiceDetail?id=${invoiceId}`,
      });
    } catch (e) {
      console.error("Payment notification failed:", e.message);
    }

    return Response.json({
      success: true,
      estimate_id: estimate.id,
      estimate_number: estimate.estimate_number,
      invoice_id: invoiceId,
      deposit_paid: depositPaid,
      status: "approved"
    });

  } catch (error) {
    console.error(`[recordEstimatePayment] Outer error: ${error.message}`);
    // Alert admins so invoice-creation failures don't go silent (customer already paid)
    try {
      await base44.asServiceRole.entities.Notification.create({
        title: "Invoice Creation Failed",
        message: `Payment of $${Number(amount || 0).toFixed(2)} was received for estimate ${estimate?.estimate_number || publicAccessToken || "unknown"} but invoice creation failed: ${error.message}. The customer may have been charged without an invoice being created — manual review needed.`,
        type: "other",
        link_url: estimate ? `/EstimateDetail?id=${estimate.id}` : "/Invoices",
        is_read: false,
      });
    } catch (_) {}
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});