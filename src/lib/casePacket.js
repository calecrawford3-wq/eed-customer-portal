import { formatMoney } from "@/lib/money";

const when = (value) => (value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");

// Builds the redacted referral packet text. Nothing here reads or writes an SSN:
// Elite never stores one, and the packet states that explicitly.
export function buildCasePacketText({ caseDoc, loan, application, agreement }) {
  const identity = caseDoc?.borrower_identity || {};
  const verification = identity.identity_verification || {};
  const deposit = caseDoc?.deposit_proof || {};
  const outstanding = caseDoc?.outstanding || {};
  const disputes = Array.isArray(caseDoc?.disputes) ? caseDoc.disputes : [];
  const recoveries = Array.isArray(caseDoc?.recoveries) ? caseDoc.recoveries : [];
  const notices = Array.isArray(caseDoc?.notices) ? caseDoc.notices : [];
  const payments = Array.isArray(loan?.payments) ? loan.payments : [];
  const line = (label, value) => `${label}: ${value ?? "—"}`;

  const parts = [];
  parts.push("ELITE ENGINE DEVELOPMENT — COLLECTION REFERRAL PACKET (REDACTED)");
  parts.push(`Case ${caseDoc?.case_number || "—"} · prepared ${when(caseDoc?.referral?.prepared_at || new Date().toISOString())}`);
  parts.push("No Social Security number, identity document image, date of birth or ID number is included in this packet. Elite does not store them.");
  parts.push("");
  parts.push("BORROWER");
  parts.push(line("Legal name", identity.legal_name));
  parts.push(line("Email", identity.email));
  parts.push(line("Phone", identity.phone));
  parts.push(line("Address on file", identity.current_address));
  parts.push(line("Address source", identity.address_source));
  parts.push("");
  parts.push("IDENTITY VERIFICATION");
  parts.push(line("Provider", "Stripe Identity (document + selfie)"));
  parts.push(line("Status", verification.status));
  parts.push(line("Verified at", when(verification.verified_at)));
  parts.push(line("Provider reference", verification.reference));
  if (verification.exception) {
    parts.push(line("Owner exception method", verification.exception.alternate_method));
    parts.push(line("Owner exception reason", verification.exception.reason));
    parts.push(line("Owner exception recorded", `${when(verification.exception.at)} by ${verification.exception.by}`));
  }
  parts.push("This is an identity document check, not an SSN check and not a credit decision.");
  parts.push("");
  parts.push("AGREEMENT (SIGNED, IMMUTABLE SNAPSHOT)");
  parts.push(line("Agreement", agreement?.agreement_number));
  parts.push(line("Status", agreement?.status));
  parts.push(line("Template", `${agreement?.template_key || ""} v${agreement?.template_version || ""} (${agreement?.template_status || ""})`));
  parts.push(line("Content hash", agreement?.content_hash));
  parts.push(line("Issued", when(agreement?.issued_at)));
  parts.push(line("Signed by", agreement?.signer_name));
  parts.push(line("Signed at", when(agreement?.accepted_at)));
  parts.push(line("Finance charge / APR / term", `${formatMoney(agreement?.snapshot?.figures?.finance_charge)} · ${agreement?.snapshot?.figures?.apr}% · ${agreement?.snapshot?.figures?.term_months} months`));
  parts.push(line("Amount financed", formatMoney(agreement?.snapshot?.figures?.amount_financed)));
  parts.push("");
  parts.push("DEPOSIT");
  parts.push(line("Required", formatMoney(deposit.required)));
  parts.push(line("Paid", formatMoney(deposit.paid)));
  parts.push(line("Verified", deposit.verified ? `yes · ${when(deposit.verified_at)} · ${deposit.method}` : "no"));
  (deposit.payments || []).forEach((payment) => parts.push(`  - ${payment.date} ${payment.method} ${formatMoney(payment.amount)} ${payment.reference || ""}`));
  parts.push("");
  parts.push("OUTSTANDING (RECOMPUTED FROM THE SIGNED SCHEDULE)");
  parts.push(line("Principal", formatMoney(outstanding.principal)));
  parts.push(line("Finance charge (interest)", formatMoney(outstanding.interest)));
  parts.push(line("Fees", formatMoney(outstanding.fees)));
  parts.push(line("Total outstanding", formatMoney(outstanding.total)));
  parts.push(line("Paid to date", formatMoney(outstanding.paid_to_date)));
  parts.push(line("Overdue", `${formatMoney(outstanding.overdue_amount)} across ${outstanding.missed_installments || 0} installment(s)`));
  parts.push(line("Days past due", outstanding.days_past_due));
  parts.push("");
  parts.push("INSTALLMENTS RECORDED");
  if (!payments.length) parts.push("  none");
  payments.forEach((payment) => parts.push(`  - ${payment.date} ${payment.method} ${formatMoney(payment.amount)} ${payment.note || ""}`));
  parts.push("");
  parts.push("NOTICES");
  if (!notices.length) parts.push("  none");
  notices.forEach((notice) => parts.push(`  - ${notice.type} · ${notice.status} · drafted ${when(notice.created_at)} · approved ${when(notice.approved_at)} · delivered ${when(notice.sent_at)}`));
  parts.push("");
  parts.push("DISPUTES");
  if (!disputes.length) parts.push("  none");
  disputes.forEach((dispute) => parts.push(`  - ${when(dispute.opened_at)} · ${dispute.status} · ${dispute.summary}${dispute.resolution ? ` → ${dispute.resolution}` : ""}`));
  parts.push("");
  parts.push("RECOVERIES");
  if (!recoveries.length) parts.push("  none");
  recoveries.forEach((recovery) => parts.push(`  - ${when(recovery.at)} · ${recovery.source} · ${formatMoney(recovery.amount)} · ${recovery.note || ""}`));
  parts.push("");
  parts.push("REFERRAL");
  parts.push(line("Agency", caseDoc?.referral?.agency_name));
  parts.push(line("Agency reference", caseDoc?.referral?.agency_reference));
  parts.push(line("Prepared by", caseDoc?.referral?.prepared_by));
  parts.push(line("Submission", caseDoc?.referral?.submitted ? `recorded ${when(caseDoc.referral.submitted_at)}` : "not submitted"));
  parts.push("");
  parts.push(`Contact log entries: ${(caseDoc?.contact_log || []).length}. Ledger entries: ${(caseDoc?.ledger_snapshot || []).length}.`);
  parts.push(`Applicant: ${application?.application_number || "—"}.`);
  return parts.join("\n");
}

export function printCasePacket(text, title = "Collection referral packet") {
  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) return false;
  win.document.write(`<!doctype html><html><head><title>${title}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#111;padding:24px;}
    pre{white-space:pre-wrap;word-break:break-word;margin:0;}
  </style></head><body><pre>${text.replace(/[<>]/g, "")}</pre></body></html>`);
  win.document.close();
  win.focus();
  win.print();
  return true;
}

export function downloadCasePacket(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}