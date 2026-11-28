import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/money";
import StatusBadge from "./StatusBadge";

// Financing is never approved, declined or inferred by Elite. This panel shows
// only what the payment provider actually reported, plus a manual review path
// that requires verified evidence.
export default function FinancingPanel({ attempts = [], onReview, onRefresh, busy }) {
  const [activeId, setActiveId] = useState("");
  const [reviewStatus, setReviewStatus] = useState("needs_review");
  const [notes, setNotes] = useState("");
  const [evidence, setEvidence] = useState("");
  const [overrideAmount, setOverrideAmount] = useState("");

  const startReview = (attempt) => {
    setActiveId(attempt.id);
    setReviewStatus(attempt.review_status && attempt.review_status !== "none" ? attempt.review_status : "needs_review");
    setNotes(attempt.review_notes || "");
    setEvidence(attempt.review_evidence || "");
    setOverrideAmount(attempt.override_amount ? String(attempt.override_amount) : "");
  };

  const submit = () => {
    onReview({
      attempt_id: activeId,
      review_status: reviewStatus,
      review_notes: notes,
      review_evidence: evidence,
      override_amount: Number(overrideAmount) || 0,
    });
    setActiveId("");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-[#e20404]" /> Financing attempts</CardTitle>
        <p className="text-xs text-slate-500">
          A status from the lender appears only when the provider reports one. An abandoned or expired checkout is never recorded as a decline.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!attempts.length && <p className="text-sm text-slate-500">No financing attempts yet.</p>}
        {attempts.map((attempt) => (
          <div key={attempt.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={attempt.status} />
              <StatusBadge status={attempt.provider_decision || "not_reported"} />
              {attempt.review_status && attempt.review_status !== "none" && <StatusBadge status={attempt.review_status} />}
              <span className="text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(attempt.amount)}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {attempt.payment_pathway || "Legacy checkout"} · {attempt.provider || "stripe"} · {attempt.source === "staff_manual" ? "staff" : "customer checkout"}
              {attempt.created_date ? ` · ${format(new Date(attempt.created_date), "MMM d, yyyy h:mm a")}` : ""}
            </p>
            {!!(attempt.offered_methods || []).length && (
              <p className="text-[11px] text-slate-500">Offered: {attempt.offered_methods.join(", ")}</p>
            )}
            {attempt.provider_decision === "not_reported" && <p className="text-[11px] text-slate-600">Lender credit decision not reported. A completed lender payment confirms funding of this amount only.</p>}
            {attempt.customer_reported_outcome && <p className="text-xs text-amber-800">Customer reported ({attempt.customer_reported_lender}): {attempt.customer_reported_outcome.replace(/_/g," ")} — not provider verified</p>}
            {attempt.selected_method && <p className="text-[11px] text-slate-600">Stripe payment method: {attempt.selected_method}</p>}
            {attempt.stripe_session_id && <p className="text-[11px] text-slate-500 break-all">Stripe session: {attempt.stripe_session_id}</p>}
            {attempt.provider_decision_source === "stripe_verified_payment" && <p className="text-[11px] font-medium text-emerald-700">Lender payment verified by Stripe</p>}
            {Number(attempt.verified_amount) > 0 && <p className="text-[11px] text-emerald-700">Verified {formatMoney(attempt.verified_amount)}</p>}
            {attempt.error_message && <p className="text-[11px] text-amber-700">{attempt.error_message}</p>}
            {attempt.review_evidence && <p className="text-[11px] text-slate-600">Evidence: {attempt.review_evidence}</p>}

            {activeId === attempt.id ? (
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Manual outcome</Label>
                    <Select value={reviewStatus} onValueChange={setReviewStatus}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="needs_review">Needs review</SelectItem>
                        <SelectItem value="approved">Approve after review</SelectItem>
                        <SelectItem value="denied">Decline after review</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Authorized amount (optional)</Label>
                    <Input type="number" min="0" step="0.01" className="mt-1" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Verified evidence (required to approve or decline)</Label>
                  <Input className="mt-1" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Lender reference, representative name, date verified" />
                </div>
                <Textarea className="min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal review notes" />
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy} onClick={submit}>Save review</Button>
                  <Button size="sm" variant="ghost" onClick={() => setActiveId("")}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 mt-2"><Button size="sm" variant="outline" onClick={() => startReview(attempt)}>Review</Button>{attempt.stripe_session_id && <Button size="sm" variant="outline" disabled={busy} onClick={() => onRefresh?.(attempt.id)}>Check Stripe status</Button>}</div>
            )}
          </div>
        ))}
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-none" />
          Never read "no completion" as a denial. Only a provider-reported or evidence-backed outcome is recorded here.
        </p>
      </CardContent>
    </Card>
  );
}