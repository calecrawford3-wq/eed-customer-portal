// One place that answers "where is this file, and what needs a human next?".
// Used by the review queue and the application detail so both always agree.
import { formatMoney } from "@/lib/money";

export const STAGES = [
  { key: "application", label: "Application" },
  { key: "offer", label: "Offer" },
  { key: "identity", label: "Identity" },
  { key: "terms", label: "Terms" },
  { key: "signature", label: "Signature" },
  { key: "deposit", label: "Deposit" },
  { key: "active", label: "Active" },
];

export function applicationStage({ application, offer, loan, verification, caseDoc }) {
  const appStatus = String(application?.status || "submitted");
  const loanStatus = String(loan?.status || "");
  const identityOk = ["verified", "exception"].includes(String(verification?.status || ""));
  const sent = !!offer?.sent_at;
  const accepted = !!offer?.accepted_at;
  const signed = !!loan?.signed_at;
  const depositVerified = offer?.deposit_verified === true || ["active", "completed"].includes(loanStatus);
  const active = ["active", "completed"].includes(loanStatus);

  const done = {
    application: !["submitted", "under_review", "info_requested"].includes(appStatus),
    offer: !!offer && (sent || accepted),
    identity: identityOk,
    terms: ["approved", "active", "completed"].includes(loanStatus),
    signature: signed,
    deposit: depositVerified,
    active,
  };

  let current = "application";
  if (!done.application) current = "application";
  else if (!done.offer) current = "offer";
  else if (loanStatus === "pending_approval") current = identityOk ? "terms" : "identity";
  else if (loanStatus === "approved" && !signed) current = "signature";
  else if (signed && !depositVerified) current = "deposit";
  else if (active) current = "active";
  else if (done.offer) current = done.identity ? "terms" : "identity";
  if (caseDoc && active) current = "active";

  const stages = STAGES.map((stage) => ({
    ...stage,
    done: done[stage.key] === true,
    current: stage.key === current,
  }));

  let action = { level: "info", label: "No action needed", detail: "This file is moving on its own." };
  if (!done.application) {
    action = { level: "urgent", label: "Decide the application", detail: "Approve, deny, or ask the applicant for more information." };
  } else if (!offer) {
    action = { level: "urgent", label: "Build the offer", detail: "Create the award offer from the application so the customer can see the numbers." };
  } else if (!sent) {
    action = { level: "urgent", label: "Send the offer", detail: `${offer.offer_number} is ready. Send the secure link to the customer.` };
  } else if (loanStatus === "pending_approval") {
    action = identityOk
      ? {
        level: "urgent",
        label: loan?.revision_requested ? "Re-approve the changed plan" : "Approve or decline the in-house plan",
        detail: `${formatMoney(loan.requested_monthly_payment)} over ${Number(loan.requested_term_months) || 0} payments requested. The customer accepted nothing yet.`,
      }
      : { level: "waiting", label: "Waiting on identity verification", detail: "Elite cannot approve in-house terms until Stripe verifies the borrower or an owner exception is recorded." };
  } else if (loanStatus === "declined") {
    action = { level: "info", label: "In-house plan declined", detail: loan?.decline_reason || "The customer was told the reason and can apply again." };
  } else if (loanStatus === "approved" && !signed) {
    action = { level: "waiting", label: "Waiting on the customer signature", detail: "The agreement is issued. Nothing is owed until the customer signs." };
  } else if (signed && !depositVerified) {
    action = { level: "waiting", label: "Waiting on the deposit", detail: `${formatMoney(offer?.deposit_amount)} deposit is payable before the plan starts.` };
  } else if (active) {
    action = { level: "info", label: "Plan active — servicing", detail: `Record installments as they arrive. Outstanding ${formatMoney(loan?.outstanding_balance)}.` };
  } else if (accepted) {
    action = { level: "info", label: "Paid in full", detail: "The offer was paid. Open the shop job when the build starts." };
  }

  return { stages, current, action };
}