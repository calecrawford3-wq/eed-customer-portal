import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, HeartHandshake } from "lucide-react";
import { format } from "date-fns";
import StatusBadge from "./StatusBadge";
import { formatMoney } from "@/lib/money";

const INCOME = {
  under_35k: "Under $35k",
  "35k_75k": "$35k – $75k",
  over_75k: "Over $75k",
  prefer_not_to_say: "Not stated",
};

export default function ApplicationQueueCard({ application, offer }) {
  const name = `${application.first_name || ""} ${application.last_name || ""}`.trim() || "Applicant";
  const submitted = application.submitted_at || application.created_date;
  return (
    <Link
      to={`/EngineAssistance/${application.id}`}
      className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-slate-300"
    >
      <span className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-rose-50 text-rose-700">
        <HeartHandshake className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-900 truncate">{name}</p>
          <StatusBadge status={application.status} />
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
      </div>
      <ChevronRight className="h-5 w-5 flex-none text-slate-300 group-hover:text-slate-500 mt-1" />
    </Link>
  );
}