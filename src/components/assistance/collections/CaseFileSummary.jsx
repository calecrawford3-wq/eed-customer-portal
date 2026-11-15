import React from "react";
import { formatMoney } from "@/lib/money";
import { BadgeCheck, FileSignature, Landmark, ShieldCheck, Wallet } from "lucide-react";

const when = (value) => (value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");

// Collections-ready snapshot: identity, deposit proof and itemized balance.
// Everything here comes from the stored case file, not from browser input.
export default function CaseFileSummary({ caseDoc, loan }) {
  if (!caseDoc) return null;
  const identity = caseDoc.borrower_identity || {};
  const verification = identity.identity_verification || {};
  const deposit = caseDoc.deposit_proof || {};
  const outstanding = caseDoc.outstanding || {};
  const ledger = Array.isArray(caseDoc.ledger_snapshot) ? caseDoc.ledger_snapshot : [];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> Verified borrower</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{identity.legal_name || caseDoc.customer_name || "—"}</p>
        <p className="text-[11px] text-slate-600">{identity.email || "—"} · {identity.phone || "—"}</p>
        <p className="text-[11px] text-slate-600">{identity.current_address || "No address on file"} <span className="text-slate-400">({identity.address_source || "—"})</span></p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`rounded-full px-2 py-0.5 font-medium ${verification.status === "verified" ? "bg-emerald-100 text-emerald-800" : verification.status === "exception" ? "bg-purple-100 text-purple-800" : "bg-amber-100 text-amber-800"}`}>
            Identity: {verification.status || "not_started"}
          </span>
          {verification.verified_at && <span className="text-slate-500">verified {when(verification.verified_at)}</span>}
          {verification.reference && <span className="break-all text-[10px] text-slate-400">{verification.reference}</span>}
        </div>
        {verification.exception && (
          <p className="mt-1 text-[11px] text-purple-800">Owner exception: {verification.exception.alternate_method} · {verification.exception.reason}</p>
        )}
        <p className="mt-1 text-[10px] text-slate-400">No SSN, ID number, document image or date of birth is stored. Document check only, not a credit decision.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><Wallet className="h-3.5 w-3.5" /> Deposit proof</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{formatMoney(deposit.paid || 0)} of {formatMoney(deposit.required || 0)}</p>
          <p className="text-[11px] text-slate-600">{deposit.verified ? `Verified ${when(deposit.verified_at)} · ${deposit.method || ""}` : "Not verified"}</p>
          {(deposit.payments || []).slice(0, 4).map((payment, index) => (
            <p key={index} className="text-[10px] text-slate-500">{payment.date} · {payment.method} · {formatMoney(payment.amount)}{payment.reference ? ` · ${payment.reference}` : ""}</p>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><Landmark className="h-3.5 w-3.5" /> Itemized outstanding</p>
          <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
            <p className="flex justify-between"><span>Principal</span><span className="tabular-nums font-medium text-slate-900">{formatMoney(outstanding.principal || 0)}</span></p>
            <p className="flex justify-between"><span>Finance charge (interest)</span><span className="tabular-nums font-medium text-slate-900">{formatMoney(outstanding.interest || 0)}</span></p>
            <p className="flex justify-between"><span>Fees</span><span className="tabular-nums font-medium text-slate-900">{formatMoney(outstanding.fees || 0)}</span></p>
            <p className="flex justify-between border-t border-slate-200 pt-1"><span className="font-semibold">Total</span><span className="tabular-nums font-bold text-slate-900">{formatMoney(outstanding.total || 0)}</span></p>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Paid {formatMoney(outstanding.paid_to_date || 0)} · overdue {formatMoney(outstanding.overdue_amount || 0)} · {Number(outstanding.days_past_due) || 0} days past due</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><FileSignature className="h-3.5 w-3.5" /> Transaction ledger ({ledger.length})</p>
        {!ledger.length ? <p className="mt-1 text-[11px] text-slate-500">No ledger entries recorded.</p> : (
          <div className="mt-1 max-h-52 space-y-1 overflow-y-auto pr-1">
            {ledger.map((entry, index) => (
              <p key={index} className="flex justify-between gap-2 text-[10px] text-slate-600">
                <span className="min-w-0 truncate">{entry.occurred_at ? new Date(entry.occurred_at).toLocaleDateString("en-US") : "—"} · {entry.entry_type} · {entry.note || entry.source}</span>
                <span className={`flex-none tabular-nums font-medium ${entry.direction === "debit" ? "text-red-700" : "text-slate-900"}`}>{formatMoney(entry.amount)}</span>
              </p>
            ))}
          </div>
        )}
        <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><BadgeCheck className="h-3 w-3" /> Recompute delinquency to refresh this snapshot from the signed schedule and recorded payments.</p>
        {loan?.status && <p className="text-[10px] text-slate-400">Agreement status {loan.status} · updated {when(caseDoc.case_file_updated_at)}</p>}
      </div>
    </div>
  );
}