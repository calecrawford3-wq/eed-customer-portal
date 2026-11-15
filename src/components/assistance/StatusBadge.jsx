import React from "react";

const TONES = {
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-amber-100 text-amber-800",
  info_requested: "bg-purple-100 text-purple-700",
  approved: "bg-emerald-100 text-emerald-700",
  denied: "bg-red-100 text-red-700",
  funded: "bg-emerald-600 text-white",
  withdrawn: "bg-slate-100 text-slate-600",
  expired: "bg-slate-200 text-slate-600",
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-sky-100 text-sky-700",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  partially_paid: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-600 text-white",
  void: "bg-slate-200 text-slate-500",
  completed: "bg-emerald-100 text-emerald-700",
  pending_approval: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-800",
  scheduled: "bg-slate-100 text-slate-600",
  pending: "bg-amber-100 text-amber-800",
  initiated: "bg-blue-100 text-blue-700",
  canceled: "bg-slate-100 text-slate-600",
  failed: "bg-red-100 text-red-700",
  not_reported: "bg-slate-100 text-slate-600",
  needs_review: "bg-amber-100 text-amber-800",
  none: "bg-slate-100 text-slate-500",
  incomplete: "bg-amber-100 text-amber-800",
};

const LABELS = {
  under_review: "Under review",
  info_requested: "Info requested",
  partially_paid: "Partially paid",
  not_reported: "Not reported",
  needs_review: "Needs review",
  pending_approval: "Awaiting approval",
  us_bank_account: "ACH bank",
  afterpay_clearpay: "Afterpay",
};

export default function StatusBadge({ status, className = "" }) {
  if (!status) return null;
  const tone = TONES[status] || "bg-slate-100 text-slate-600";
  const label = LABELS[status] || String(status).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${tone} ${className}`}>
      {label}
    </span>
  );
}