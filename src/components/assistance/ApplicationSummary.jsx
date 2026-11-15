import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Home, Flag, Bike, MessageSquareQuote, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

const INCOME = {
  under_35k: "Under $35,000",
  "35k_75k": "$35,000 – $75,000",
  over_75k: "Over $75,000",
  prefer_not_to_say: "Prefer not to say",
};

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 break-words whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export default function ApplicationSummary({ application }) {
  const name = `${application.first_name || ""} ${application.last_name || ""}`.trim() || "Applicant";
  const submitted = application.submitted_at || application.created_date;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4 text-[#e20404]" /> Applicant</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" value={name} />
          <Field label="Email" value={application.email} />
          <Field label="Phone" value={application.phone} />
          <Field label="City / State" value={[application.city, application.state].filter(Boolean).join(", ")} />
          <Field label="Household income" value={INCOME[application.household_income_bracket] || ""} />
          <Field label="Household size" value={application.household_size ? String(application.household_size) : ""} />
          <Field label="Submitted" value={submitted ? format(new Date(submitted), "MMM d, yyyy h:mm a") : ""} />
          <Field label="Template" value={`${application.template_key || ""} v${application.template_version || 1}`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Flag className="h-4 w-4 text-[#e20404]" /> Racing and request</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Engine / platform" value={application.engine_platform_text} />
          <Field label="Years racing" value={application.years_racing ? String(application.years_racing) : ""} />
          <Field label="Classes / series" value={application.racing_classes} />
          <Field label="Tracks" value={application.racing_tracks} />
          <div className="sm:col-span-2">
            <Field label="Racing experience" value={application.racing_experience} />
          </div>
          <div className="sm:col-span-2">
            <Field label="Requested help" value={application.requested_help} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Home className="h-4 w-4 text-[#e20404]" /> Hardship</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{application.hardship_explanation || "No hardship statement provided."}</p>
        </CardContent>
      </Card>

      {!!(application.references || []).length && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Bike className="h-4 w-4 text-[#e20404]" /> References</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {application.references.map((ref, index) => (
              <div key={index} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">{ref.name || "Reference"}</p>
                {ref.relationship && <p className="text-xs text-slate-500">{ref.relationship}</p>}
                {ref.phone && <p className="text-xs text-slate-600 mt-1">{ref.phone}</p>}
                {ref.email && <p className="text-xs text-slate-600 break-all">{ref.email}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!!(application.answers || []).length && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><MessageSquareQuote className="h-4 w-4 text-[#e20404]" /> Submitted answers</CardTitle>
            <p className="text-xs text-slate-500">Exactly as the applicant answered the {application.template_key} template.</p>
          </CardHeader>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Show {application.answers.length} answers</summary>
              <div className="mt-3 space-y-3">
                {application.answers.map((answer, index) => (
                  <div key={index}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{answer.label}</p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{answer.value}</p>
                  </div>
                ))}
              </div>
            </details>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-none" />
              Consented {application.consent_at ? format(new Date(application.consent_at), "MMM d, yyyy h:mm a") : "on submission"} · {application.consent_version || "template v1"}. No Social Security, bank or card numbers are collected.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}