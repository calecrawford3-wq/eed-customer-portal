import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck } from "lucide-react";
import { APPLICATION_CONSENT_TEXT, EMPLOYMENT_OPTIONS } from "@/lib/financingApplicationText";
import { validateApplicant } from "./applicantForm";

const selectClass = "mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none";

function Field({ label, error, children, className = "" }) {
  return (
    <label className={`block text-[11px] font-medium text-slate-700 ${className}`}>
      {label}
      {children}
      {error ? <span className="mt-1 block text-[11px] font-medium text-red-700">{error}</span> : null}
    </label>
  );
}

// Step 3 — the applicant's own details. Every field is required by the server's
// allowlist, so validation happens inline before the customer can continue.
export default function StepApplicant({ form, setForm, consent, setConsent }) {
  const [touched, setTouched] = useState({});
  const { errors } = validateApplicant(form);
  const shown = (key) => (touched[key] ? errors[key] : "");
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const mark = (key) => () => setTouched((prev) => ({ ...prev, [key]: true }));

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-bold text-slate-900">Your details</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Elite reviews every application by hand. These details are stored on your financing request only.
        </p>
      </div>

      <Field label="Full legal name" error={shown("legal_name")} className="sm:col-span-2">
        <Input className="mt-1 h-11" value={form.legal_name} onChange={set("legal_name")} onBlur={mark("legal_name")} autoComplete="name" placeholder="As printed on your ID" />
      </Field>

      <Field label="Street address" error={shown("address_line1")}>
        <Input className="mt-1 h-11" value={form.address_line1} onChange={set("address_line1")} onBlur={mark("address_line1")} autoComplete="address-line1" placeholder="Street address" />
      </Field>

      <Field label="Apartment, suite (optional)">
        <Input className="mt-1 h-11" value={form.address_line2} onChange={set("address_line2")} autoComplete="address-line2" />
      </Field>

      <Field label="City" error={shown("city")}>
        <Input className="mt-1 h-11" value={form.city} onChange={set("city")} onBlur={mark("city")} autoComplete="address-level2" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="State" error={shown("state")}>
          <Input className="mt-1 h-11 uppercase" value={form.state} onChange={set("state")} onBlur={mark("state")} maxLength={2} autoComplete="address-level1" placeholder="OK" />
        </Field>
        <Field label="ZIP" error={shown("postal_code")}>
          <Input className="mt-1 h-11" value={form.postal_code} onChange={set("postal_code")} onBlur={mark("postal_code")} inputMode="numeric" autoComplete="postal-code" placeholder="74101" />
        </Field>
      </div>

      <Field label="Date of birth" error={shown("date_of_birth")}>
        <Input className="mt-1 h-11" type="date" value={form.date_of_birth} onChange={set("date_of_birth")} onBlur={mark("date_of_birth")} autoComplete="bday" />
      </Field>

      <Field label="Employment status" error={shown("employment_status")}>
        <select
          className={selectClass}
          value={form.employment_status}
          onChange={(event) => { set("employment_status")(event); setTouched((prev) => ({ ...prev, employment_status: true })); }}
        >
          <option value="">Choose…</option>
          {EMPLOYMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Employer (optional)">
        <Input className="mt-1 h-11" value={form.employer_name} onChange={set("employer_name")} autoComplete="organization" />
      </Field>

      <Field label="Monthly income (USD)" error={shown("monthly_income")}>
        <Input className="mt-1 h-11" value={form.monthly_income} onChange={set("monthly_income")} onBlur={mark("monthly_income")} inputMode="decimal" placeholder="3200" />
      </Field>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-[#e20404]" />
        <p className="text-[11px] leading-relaxed text-slate-600">
          No Social Security number, bank login or ID number is collected here. If the identity provider needs an SSN you type it only on the
          provider&apos;s own secure page during verification.
        </p>
      </div>

      <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
        <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} className="mt-0.5" />
        <span>{APPLICATION_CONSENT_TEXT}</span>
      </label>
    </div>
  );
}