import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, PencilLine, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/money";
import { EMPLOYMENT_OPTIONS } from "@/lib/financingApplicationText";

// Step 4 — read it back before it is sent. Nothing is submitted from anywhere
// else, so the customer sees every figure and every detail in one place.
export default function StepReview({ offer, deposit, selected, form, busy, onEdit, onSubmit }) {
  const employment = EMPLOYMENT_OPTIONS.find((option) => option.value === form.employment_status);
  const dob = form.date_of_birth ? format(new Date(`${form.date_of_birth}T12:00:00`), "MMM d, yyyy") : "—";

  const rows = [
    ["Deposit due today", formatMoney(Number(deposit?.deposit_amount || 0))],
    ["Financed by Elite", formatMoney(Number(deposit?.internal_amount || 0))],
    ["Your chosen plan", selected ? `${selected.term_months} payments of ${formatMoney(selected.monthly_payment)}` : "—"],
    ["Indicative APR", `${Number(deposit?.financing?.apr) || 0}%`],
    ["Total of payments", selected ? formatMoney(selected.total_repayable) : "—"],
    ["Balance after assistance", formatMoney(Number(offer?.balance_due ?? offer?.total ?? 0))],
  ];

  const address = [form.address_line1, form.address_line2, `${form.city}, ${String(form.state).toUpperCase()} ${form.postal_code}`]
    .filter(Boolean).join(" · ");

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-bold text-slate-900">Review and submit</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Submitting asks Elite to review this plan. It does not create a loan, charge a payment, or run a credit check.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your plan</p>
          <Button variant="ghost" size="sm" className="-mr-2 h-8 px-2 text-[11px]" onClick={() => onEdit("terms")}>
            <PencilLine className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>
        <dl className="mt-1 space-y-1 text-[12px]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-600">{label}</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your details</p>
          <Button variant="ghost" size="sm" className="-mr-2 h-8 px-2 text-[11px]" onClick={() => onEdit("applicant")}>
            <PencilLine className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>
        <div className="mt-1 space-y-0.5 text-[12px] text-slate-700">
          <p className="font-semibold text-slate-900">{form.legal_name}</p>
          <p className="break-words">{address}</p>
          <p>Date of birth: {dob}</p>
          <p>{employment?.label || "—"}{form.employer_name ? ` · ${form.employer_name}` : ""}</p>
          <p>Monthly income: {formatMoney(Number(form.monthly_income) || 0)}</p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-[#e20404]" />
        <p className="text-[11px] leading-relaxed text-slate-600">
          After you submit, Elite verifies your identity through Stripe and reviews the plan by hand. The approved rate, payment and schedule may
          differ from these estimates, and you must accept any change before signing.
        </p>
      </div>

      <Button className="h-12 w-full text-base" disabled={!selected || !!busy} onClick={onSubmit}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit application for review
      </Button>
      <p className="text-center text-[10px] text-slate-400">Elite reviews every application by hand. Nothing is owed until you sign approved terms.</p>
    </div>
  );
}