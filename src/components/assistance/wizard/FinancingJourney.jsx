import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import JourneyHeader from "./JourneyHeader";
import StepPlan from "./StepPlan";
import StepTerms from "./StepTerms";
import StepApplicant from "./StepApplicant";
import StepReview from "./StepReview";
import StepUnderwriting from "./StepUnderwriting";
import StepAgreement from "./StepAgreement";
import StepDeposit from "./StepDeposit";
import StepDeclined from "./StepDeclined";
import FullBalanceStep from "../payment/FullBalanceStep";
import { EMPTY_APPLICANT, draftKey, validateApplicant } from "./applicantForm";

// The customer financing journey. Every screen is derived from the real offer
// status, so a returning customer resumes where the server says they are and no
// step ever claims something the backend has not confirmed.
export default function FinancingJourney({
  offer, token = "", paying = "", actionBusy = "", onCheckout, onRequest, onSign, onCancel, onChangePlan, onIdentityChanged,
}) {
  const deposit = offer?.pathways?.deposit_internal || {};
  const full = offer?.pathways?.pay_in_full || {};
  const finance = offer?.pathways?.finance_full || {};
  const loan = offer?.internal_loan || null;
  const identity = offer?.identity || null;
  const status = String(deposit.loan_status || "");
  const active = ["active", "completed"].includes(status);
  const signed = !!loan?.signed_at;
  const verified = identity?.verified === true || !!identity?.exception;

  const [mode, setMode] = useState("deposit");
  const [index, setIndex] = useState(0);
  const [form, setForm] = useState(EMPTY_APPLICANT);
  const [consent, setConsent] = useState(false);
  const [term, setTerm] = useState(0);
  const [restart, setRestart] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Resume an unfinished application on this device, then keep it saved as the
  // customer moves between steps. Consent is never restored: it is given afresh.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(token));
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft?.form) setForm({ ...EMPTY_APPLICANT, ...draft.form });
      if (draft?.term) setTerm(Number(draft.term));
    } catch { /* an unreadable draft simply starts empty */ }
  }, [token]);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey(token), JSON.stringify({ form, term }));
    } catch { /* storage may be unavailable in private mode */ }
  }, [form, term, token]);

  const financing = deposit.financing || null;
  const eligible = useMemo(() => (financing?.options || []).filter((option) => option.meets_minimum), [financing]);
  const termKey = eligible.map((option) => option.term_months).join(",");

  useEffect(() => {
    if (!eligible.length) return;
    if (eligible.some((option) => option.term_months === Number(term))) return;
    setTerm(Number(financing?.default_term_months) || eligible[eligible.length - 1].term_months);
  }, [termKey, term, financing, eligible]);

  const selected = eligible.find((option) => option.term_months === Number(term)) || null;

  const base = useMemo(() => {
    if (status === "pending_approval") return [{ id: "underwriting" }];
    if (status === "approved" && !signed) return [{ id: "agreement" }];
    if (status === "declined" && !restart) return [{ id: "declined" }];
    if (signed && !active) return [{ id: "deposit" }];
    if (deposit.deposit_verified && !active) return [{ id: "deposit" }];
    return [{ id: "plan" }, { id: "terms" }, { id: "applicant" }, { id: "review" }];
  }, [status, signed, active, verified, restart, deposit.deposit_verified]);

  const isApplication = base[0]?.id === "plan";
  const screens = isApplication && mode === "full" ? [{ id: "plan" }, { id: "full" }] : base;
  const flowKey = base.map((screen) => screen.id).join(">");

  useEffect(() => { setIndex(0); }, [flowKey]);

  // The step list shrinks the moment the server status changes: four application
  // steps become the single review step right after submitting. Every read goes
  // through this clamped index, so a stale index can never fall off the list.
  const safeIndex = Math.min(Math.max(index, 0), Math.max(screens.length - 1, 0));
  const current = screens[safeIndex]?.id || "review";
  const applicant = validateApplicant(form);

  const canAdvance = (() => {
    if (current === "plan") return mode === "full" ? !!full.enabled : !!deposit.available;
    if (current === "terms") return !!selected;
    if (current === "applicant") return applicant.ok && consent;
    if (current === "identity") return true;
    return false;
  })();

  const showNav = ["plan", "terms", "applicant"].includes(current);

  const refresh = async () => {
    setRefreshing(true);
    try { await onIdentityChanged?.(); } finally { setRefreshing(false); }
  };

  // One submission per application: a second tap while the first is in flight is
  // ignored, and the server refuses a duplicate request for the same offer.
  const submitting = useRef(false);
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const submit = async () => {
    if (!selected || submitting.current || actionBusy === "request" || submittedOnce) return;
    submitting.current = true;
    try {
      await onRequest({
        application: { ...form, monthly_income: Number(form.monthly_income), consent: true },
        requested_term_months: selected.term_months,
      });
      setSubmittedOnce(true);
      setConsent(false);
      try { localStorage.removeItem(draftKey(token)); } catch { /* nothing to clear */ }
    } finally {
      submitting.current = false;
    }
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <JourneyHeader screens={screens} index={safeIndex} fundName={typeof offer?.fund_name === "string" ? offer.fund_name : ""} />

        {current === "plan" && (
          <StepPlan offer={offer} deposit={deposit} full={full} value={mode} onChange={(next) => { setMode(next); }} />
        )}
        {current === "full" && (
          <FullBalanceStep full={full} finance={finance} paying={paying} onCheckout={onCheckout} />
        )}
        {current === "terms" && (
          <StepTerms financing={financing} value={term} onChange={setTerm} depositAmount={Number(deposit.deposit_amount) || 0} />
        )}
        {current === "applicant" && (
          <StepApplicant form={form} setForm={setForm} consent={consent} setConsent={setConsent} />
        )}
        {current === "review" && (
          <StepReview
            offer={offer}
            deposit={deposit}
            selected={selected}
            form={form}
            busy={actionBusy === "request"}
            onEdit={(target) => setIndex(screens.findIndex((screen) => screen.id === target))}
            onSubmit={submit}
          />
        )}
        {current === "underwriting" && (
          <StepUnderwriting
            loan={loan}
            deposit={deposit}
            identity={identity}
            token={token}
            verified={verified}
            actionBusy={actionBusy}
            onCancel={onCancel}
            onRefresh={refresh}
            onIdentityChanged={onIdentityChanged}
            refreshing={refreshing}
          />
        )}
        {current === "agreement" && (
          <StepAgreement
            deposit={deposit}
            loan={loan}
            agreement={offer?.internal_agreement}
            actionBusy={actionBusy}
            onSign={onSign}
            onChangePlan={onChangePlan}
          />
        )}
        {current === "deposit" && deposit.deposit_verified && !active ? (
          <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
            <div className="min-w-0 text-xs text-emerald-900">
              <p className="font-semibold">Your deposit is verified</p>
              <p className="mt-1 text-emerald-800">
                Elite is activating your signed plan. This page updates as soon as it is live; nothing else is owed today.
              </p>
            </div>
          </div>
        ) : current === "deposit" ? (
          <StepDeposit
            deposit={deposit}
            loan={loan}
            paying={paying}
            actionBusy={actionBusy}
            onCheckout={onCheckout}
            token={token}
            autopayEnabled={offer?.autopay_enabled === true}
            paymentsTestMode={offer?.payments_test_mode === true}
            onChanged={onIdentityChanged}
          />
        ) : null}
        {current === "declined" && (
          <StepDeclined
            deposit={deposit}
            loan={loan}
            full={full}
            onRestart={() => { setRestart(true); setMode("deposit"); }}
            onPayFull={() => { setMode("full"); setRestart(true); }}
          />
        )}

        {(showNav || safeIndex > 0) && (
          <div className="mt-4 flex items-center gap-2">
            {safeIndex > 0 && (
              <Button variant="outline" className="h-11 flex-1" disabled={!!paying || !!actionBusy} onClick={() => setIndex((value) => Math.max(0, value - 1))}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            {showNav && (
              <Button className="h-11 flex-[2]" disabled={!canAdvance || !!paying || !!actionBusy} onClick={() => setIndex((value) => Math.min(screens.length - 1, value + 1))}>
                {current === "identity" ? "Continue to review status" : current === "plan" ? "Continue" : "Next"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}