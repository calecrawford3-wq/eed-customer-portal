import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";

// Audit completion billing for a job/build. Checks all linked invoices for
// billing consistency and returns a report of any issues found.
//
// Checks:
//   1. Build complete but invoices still have due_on_completion=true
//   2. Invoice balance_due doesn't match (total - applied_credits - payments)
//   3. Invoice amount_paid doesn't match sum of payments array
//   4. Completed build with no invoice
//   5. Invoice status doesn't match balance (paid vs partial vs sent)
//   6. Combined invoice member statuses inconsistent with parent
//
// POST { job_id } or { build_id }
// Returns { issues: [...], summary: {...}, clean: boolean }

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin required" }, { status: 403 });
    }

    const body = await req.json();
    const jobId = body.job_id;
    const buildId = body.build_id;

    if (!jobId && !buildId) {
      return Response.json({ error: "job_id or build_id required" }, { status: 400 });
    }

    // Load job if needed
    let job = null;
    if (jobId) {
      const jobRes = await base44.asServiceRole.entities.Job.filter({ id: jobId });
      job = (jobRes.items || jobRes || [])[0];
      if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
      buildId = buildId || job.build_id;
    }

    // Load build
    let build = null;
    if (buildId) {
      const buildRes = await base44.asServiceRole.entities.EngineBuild.filter({ id: buildId });
      build = (buildRes.items || buildRes || [])[0];
    }

    // Load invoices
    let invoices = [];
    if (buildId) {
      const invRes = await base44.asServiceRole.entities.Invoice.filter({ build_id: buildId });
      invoices = invRes.items || invRes || [];
    }
    if (invoices.length === 0 && job?.invoice_ids?.length) {
      const invRes = await base44.asServiceRole.entities.Invoice.filter({ id: { $in: job.invoice_ids } });
      invoices = invRes.items || invRes || [];
    }

    const isBuildComplete = build && (build.status === "complete" || build.status === "shipped");
    const issues = [];

    // CHECK 1: Completed build with no invoice
    if (isBuildComplete && invoices.length === 0) {
      issues.push({
        severity: "warning",
        check: "no_invoice",
        message: "Build is complete but no invoice exists. Create an invoice before pickup.",
      });
    }

    for (const inv of invoices) {
      // CHECK 2: Build complete but invoice still due_on_completion
      if (isBuildComplete && inv.due_on_completion && inv.status !== "paid" && inv.status !== "void") {
        issues.push({
          severity: "error",
          check: "due_on_completion_stale",
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          message: `Invoice ${inv.invoice_number}: Build is complete but due_on_completion is still true. Due date should have been set to the completion date.`,
        });
      }

      // CHECK 3: amount_paid doesn't match payments array
      const paymentsSum = (inv.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const recordedPaid = Number(inv.amount_paid) || 0;
      if (Math.abs(paymentsSum - recordedPaid) > 0.01) {
        issues.push({
          severity: "error",
          check: "payment_mismatch",
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          message: `Invoice ${inv.invoice_number}: amount_paid (${recordedPaid.toFixed(2)}) doesn't match sum of payments (${paymentsSum.toFixed(2)}).`,
          detail: { amount_paid: recordedPaid, payments_sum: paymentsSum },
        });
      }

      // CHECK 4: balance_due doesn't match computed balance
      const total = Number(inv.total) || 0;
      const credits = Number(inv.applied_credits) || 0;
      const computedBalance = Math.max(0, total - credits - paymentsSum);
      const recordedBalance = Number(inv.balance_due) || 0;
      if (Math.abs(computedBalance - recordedBalance) > 0.01) {
        issues.push({
          severity: "error",
          check: "balance_mismatch",
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          message: `Invoice ${inv.invoice_number}: balance_due (${recordedBalance.toFixed(2)}) doesn't match computed balance (${computedBalance.toFixed(2)}).`,
          detail: { recorded_balance: recordedBalance, computed_balance: computedBalance },
        });
      }

      // CHECK 5: Status doesn't match balance
      const expectedStatus = computedBalance < 0.01
        ? (paymentsSum > 0 ? "paid" : (inv.status === "draft" ? "draft" : "sent"))
        : (paymentsSum > 0 ? "partial" : inv.status);
      if (inv.status !== "void" && inv.status !== "draft" && expectedStatus !== inv.status) {
        // Only flag if the status is materially wrong (e.g. "paid" but has balance, or "sent" but fully paid)
        if ((inv.status === "paid" && computedBalance > 0.01) ||
            (computedBalance < 0.01 && paymentsSum > 0 && inv.status !== "paid")) {
          issues.push({
            severity: "warning",
            check: "status_mismatch",
            invoice_id: inv.id,
            invoice_number: inv.invoice_number,
            message: `Invoice ${inv.invoice_number}: status is "${inv.status}" but balance suggests "${expectedStatus}".`,
            detail: { current_status: inv.status, expected_status: expectedStatus, balance: computedBalance },
          });
        }
      }

      // CHECK 6: Combined invoice — check member invoice consistency
      if (inv.is_combined && inv.member_invoice_ids?.length) {
        const memberRes = await base44.asServiceRole.entities.Invoice.filter({ id: { $in: inv.member_invoice_ids } });
        const members = memberRes.items || memberRes || [];
        for (const member of members) {
          if (member.combined_parent_id !== inv.id) {
            issues.push({
              severity: "warning",
              check: "combined_member_link",
              invoice_id: member.id,
              invoice_number: member.invoice_number,
              message: `Member invoice ${member.invoice_number}: combined_parent_id doesn't point back to ${inv.invoice_number}.`,
            });
          }
          if (member.status === "paid" && inv.status !== "paid") {
            issues.push({
              severity: "warning",
              check: "combined_member_status",
              invoice_id: member.id,
              invoice_number: member.invoice_number,
              message: `Member invoice ${member.invoice_number} is marked paid but combined parent ${inv.invoice_number} is not.`,
            });
          }
        }
      }
    }

    const summary = {
      job_number: job?.job_number || null,
      build_status: build?.status || null,
      build_complete: isBuildComplete,
      invoice_count: invoices.length,
      total_balance: invoices.reduce((s, inv) => s + (Number(inv.balance_due) || 0), 0),
      total_paid: invoices.reduce((s, inv) => s + (Number(inv.amount_paid) || 0), 0),
      issues_count: issues.length,
      errors_count: issues.filter(i => i.severity === "error").length,
      warnings_count: issues.filter(i => i.severity === "warning").length,
    };

    return Response.json({
      success: true,
      issues,
      summary,
      clean: issues.length === 0,
    });
  } catch (error) {
    console.error("[auditCompletionBilling] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});