import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, HeartHandshake, ShieldCheck, AlertTriangle, FileSignature } from "lucide-react";
import { format } from "date-fns";
import StatusBadge from "./StatusBadge";
import { formatMoney } from "@/lib/money";
import { applicationStage } from "./admin/applicationStage";

const INCOME = {
  under_35k: "Under $35k",
  "35k_75k": "$35k – $75k",
  over_75k: "Over $75k",
  prefer_not_to_say: "Not stated",
};

// One row per application in the review queue. It answers "does this need me?"
// with the same stage logic the detail page uses.
export default function ApplicationQueueCard({ application, offer, loan = null, verification = null }) {
  const name = `${application.first_name || ""} ${application.last_name || ""}`.trim() || "Applicant";
  const submitted = application.submitted_at || application.created_date;
  const stage = applicationStage({ application, offer, loan, verification });
  const urgent = stage.action.level === "urgent";
  const waiting = stage.action.level === "waiting";
  const requested = Number(loan?.requested_term_months) || 0;

  return (
    <Link
      to={`/EngineAssistance/${application.id}`}
      className={`group flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
        urgent ? "border-amber-300 hover:border-amber-400" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <span className={`mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl ${urgent ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>
        {urgent ? <AlertTriangle className="h-5 w-5" /> : <HeartHandshake className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-900 truncate">{name}</p>
          <StatusBadge status={application.status} />
          {loan && <StatusBadge status={loan.status} />}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {application.application_number} · {INCOME[application.household_income_bracket] || "Income not stated"}
          {submitted ? ` · ${format(new Date(submitted), "MMM d, yyyy")}` : ""}
        </p>
        <p className="text-sm text-slate-600 mt-1.5 line-clamp-2">
          {application.engine_platform_text || "Engine not specified"}
          {application.requested_help ? ` — ${application.requested_help.split("\n")[0]}` : ""}
        </p>
        {offer && (
          <p className="text-xs text-slate-500 mt-1">
            {offer.offer_number} · package {formatMoney(offer.total)} · due {formatMoney(offer.balance_due ?? offer.amount_due)}
          </p>
        )}
        {requested > 0 && (
          <p className="text-xs text-slate-500 mt-0.5">
            Customer plan: {formatMoney(loan.requested_monthly_payment)} / month · {requested} payments · {Number(loan.requested_apr) || 0}% APR
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            urgent ? "bg-amber-100 text-amber-900" : waiting ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"
          }`}>
            {urgent ? "Action required" : stage.action.label}
          </span>
          {["verified", "exception"].includes(String(verification?.status || "")) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
              <ShieldCheck className="h-3 w-3" /> ID verified
            </span>
          )}
          {loan?.signed_at && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
              <FileSignature className="h-3 w-3" /> Signed
            </span>
          )}
          {offer?.deposit_verified && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Deposit verified</span>
          )}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 flex-none text-slate-300 group-hover:text-slate-500 mt-1" />
    </Link>
  );
}