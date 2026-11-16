import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck } from "lucide-react";
import { APPLICATION_CONSENT_TEXT, EMPLOYMENT_OPTIONS } from "@/lib/financingApplicationText";
import TermSelector from "./TermSelector";

// Real financing application. The customer picks the number of monthly payments
// from the plans the server calculated for the exact financed balance; the
// payment, total and APR are never entered here. Every field and the chosen term
// are validated again on the server. There is no Social Security number field:
// if a provider needs one, it is typed on the provider's page.
const EMPTY = {
  legal_name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  date_of_birth: "",
  employment_status: "",
  employer_name: "",
  monthly_income: "",
};

const fieldClass = "mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none";

export default function FinancingApplicationForm({ busy = false, onSubmit, financing = null, depositAmount = 0 }) {
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [term, setTerm] = useState(() => Number(financing?.default_term_months) || 0);

  const eligibleTerms = financing?.eligible_terms || [];
  const selectedOption = (financing?.options || []).find((option) => option.term_months === Number(term)) || null;

  // Keep the selection on an offered term whenever the offered set changes.
  useEffect(() => {
    if (eligibleTerms.includes(Number(term))) return;
    setTerm(Number(financing?.default_term_months) || eligibleTerms[eligibleTerms.length - 1] || 0);
  }, [eligibleTerms, financing, term]);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const ready = !!selectedOption
    && form.legal_name.trim().length >= 2
    && form.address_line1.trim().length >= 3
    && form.city.trim().length >= 2
    && /^[A-Za-z]{2}$/.test(form.state.trim())
    && /^\d{5}(-\d{4})?$/.test(form.postal_code.trim())
    && !!form.date_of_birth
    && !!form.employment_status
    && form.monthly_income !== ""
    && consent;

  const submit = () => onSubmit({
    application: { ...form, monthly_income: Number(form.monthly_income), consent: true },
    // The server recomputes the price of this term; only the choice is sent.
    requested_term_months: selectedOption?.term_months || 0,
    requested_monthly_payment: selectedOption?.monthly_payment || 0,
  });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-slate-900">Apply for Elite in-house financing</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
          Choose a monthly plan for the exact balance Elite would finance, then apply. Elite reviews the application by hand and confirms the
          final terms. Nothing is owed until Elite approves the terms and you sign the agreement.
        </p>
      </div>

      <TermSelector
        financing={financing}
        value={term}
        onChange={setTerm}
        depositAmount={depositAmount}
      />

      {eligibleTerms.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-[11px] font-medium text-slate-700 sm:col-span-2">
            Full legal name
            <Input className="mt-1" value={form.legal_name} onChange={set("legal_name")} autoComplete="name" placeholder="As printed on your ID" />
          </label>
          <label className="text-[11px] font-medium text-slate-700 sm:col-span-2">
            Street address
            <Input className="mt-1" value={form.address_line1} onChange={set("address_line1")} autoComplete="address-line1" placeholder="Street address" />
          </label>
          <label className="text-[11px] font-medium text-slate-700 sm:col-span-2">
            Apartment, suite (optional)
            <Input className="mt-1" value={form.address_line2} onChange={set("address_line2")} autoComplete="address-line2" />
          </label>
          <label className="text-[11px] font-medium text-slate-700">
            City
            <Input className="mt-1" value={form.city} onChange={set("city")} autoComplete="address-level2" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-slate-700">
              State
              <Input className="mt-1 uppercase" value={form.state} onChange={set("state")} maxLength={2} autoComplete="address-level1" placeholder="OK" />
            </label>
            <label className="text-[11px] font-medium text-slate-700">
              ZIP
              <Input className="mt-1" value={form.postal_code} onChange={set("postal_code")} inputMode="numeric" autoComplete="postal-code" placeholder="74101" />
            </label>
          </div>
          <label className="text-[11px] font-medium text-slate-700">
            Date of birth
            <Input className="mt-1" type="date" value={form.date_of_birth} onChange={set("date_of_birth")} autoComplete="bday" />
          </label>
          <label className="text-[11px] font-medium text-slate-700">
            Employment status
            <select className={fieldClass} value={form.employment_status} onChange={set("employment_status")}>
              <option value="">Choose…</option>
              {EMPLOYMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-medium text-slate-700">
            Employer (optional)
            <Input className="mt-1" value={form.employer_name} onChange={set("employer_name")} autoComplete="organization" />
          </label>
          <label className="text-[11px] font-medium text-slate-700">
            Monthly income (USD)
            <Input className="mt-1" value={form.monthly_income} onChange={set("monthly_income")} inputMode="decimal" placeholder="3200" />
          </label>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-[#e20404]" />
        <p className="text-[11px] leading-relaxed text-slate-600">
          No Social Security number, bank login or ID number is collected here. If the identity provider needs an SSN you will type it only on
          the provider&apos;s own secure page during verification.
        </p>
      </div>

      <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
        <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} className="mt-0.5" />
        <span>{APPLICATION_CONSENT_TEXT}</span>
      </label>

      <Button
        className="w-full"
        size="lg"
        disabled={!ready || busy}
        onClick={submit}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit financing application
      </Button>
      <p className="text-[10px] text-slate-400">
        Elite reviews every application by hand. Submitting it does not create a loan or a payment, and the approved terms may differ from these estimates.
      </p>
    </div>
  );
}