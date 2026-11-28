import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { FileSignature, Copy, ExternalLink, Send, Ban, DollarSign, Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { parseOfferDate } from "@/lib/offerDate";
import { formatMoney } from "@/lib/money";
import StatusBadge from "./StatusBadge";
import OfferBreakdown from "./OfferBreakdown";
import OfferEditor from "./OfferEditor";
import AcornEmailReview from "./AcornEmailReview";
import EmailDeliveryList from "./EmailDeliveryList";

export default function OfferPanel({ application, offer, onAction, busy, loan, deliveries = [] }) {
  const [acornStatus,setAcornStatus]=useState("pending");
  const [acornRef,setAcornRef]=useState("");
  const [acornEvidence,setAcornEvidence]=useState("");
  const [acornEmailId,setAcornEmailId]=useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("check");
  const [payNote, setPayNote] = useState("");
  const [applyDeposit, setApplyDeposit] = useState(false);

  const shareUrl = offer?.share_token ? `${window.location.origin}/engine-assistance/offer/${offer.share_token}` : "";
  const canApprove = ["approved", "funded"].includes(application.status);
  const balance = Number(offer?.balance_due ?? offer?.amount_due ?? 0);

  const copy = async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast.success("Offer link copied"); }
    catch { toast.error("Copy failed — select the link manually"); }
  };

  const depositOutstanding = Math.max(0, Number(offer?.deposit_amount || 0) - Number(offer?.deposit_paid || 0));

  const openPayment = () => {
    setPayAmount(balance ? String(balance) : "");
    setPayMethod("check");
    setPayNote("");
    setApplyDeposit(depositOutstanding > 0);
    setPayOpen(true);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><FileSignature className="h-4 w-4 text-[#e20404]" /> Assistance offer</CardTitle>
            <p className="text-xs text-slate-500 mt-1">The assisted engine package and what the customer pays after the award.</p>
          </div>
          {offer && <StatusBadge status={offer.status} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!offer && (
          canApprove ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Build the offer from parts, labor and machining, apply the award, then send the customer their secure link.</p>
              <Button size="sm" disabled={busy} onClick={() => onAction("create_offer", { application_id: application.id })}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />} Create offer
              </Button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Approve the application before creating an assistance offer.</p>
          )
        )}

        {offer && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{offer.offer_number}</span>
              {offer.sent_at && <span>Sent {format(new Date(offer.sent_at), "MMM d, yyyy")}</span>}
              {parseOfferDate(offer.expires_on) && <span>Expires {format(parseOfferDate(offer.expires_on), "MMM d, yyyy")}</span>}
              {Number(offer.view_count) > 0 && <span>{offer.view_count} view{Number(offer.view_count) === 1 ? "" : "s"}</span>}
            </div>

            {offer.status === "draft" ? (
              <OfferEditor offer={offer} busy={busy} onSave={(data) => onAction("update_offer", data)} />
            ) : (
              <OfferBreakdown offer={offer} />
            )}

            {offer.status !== "draft" && Number(offer.deposit_amount) > 0 && (
              <div className="rounded-xl border border-slate-200 p-3 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payment plan</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Upfront deposit ({Number(offer.deposit_percent) || 50}%)</span>
                  <span className="tabular-nums text-slate-900">{formatMoney(offer.deposit_amount)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Deposit received</span>
                  <span className="tabular-nums text-slate-900">{formatMoney(offer.deposit_paid)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Deposit verified</span>
                  {offer.deposit_verified
                    ? <StatusBadge status="approved" />
                    : <span className="text-slate-500">Not yet</span>}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Elite in-house financing</span>
                  <span className="tabular-nums text-slate-900">{formatMoney(offer.internal_financed_amount ?? offer.internal_amount ?? 0)}</span>
                </div>
                {loan && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">In-house agreement</span>
                    <StatusBadge status={loan.status} />
                  </div>
                )}
                {loan?.signed_at && (
                  <p className="text-[11px] text-slate-500">
                    Signed by {loan.signed_name} on {format(new Date(loan.signed_at), "MMM d, yyyy")}
                  </p>
                )}
                <p className="text-[11px] text-slate-500">Only {formatMoney(depositOutstanding)} of the deposit is still collectible through the offer link; the financed portion is repaid on the agreement schedule.</p>
              </div>
            )}

            {!["draft","void","paid","declined","expired"].includes(offer.status) && <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-semibold">Sunbit service eligibility</p>
              <p className="text-xs text-slate-500">Only confirm after eligible services have actually begun and the purchase amount is supported by eligible goods or work delivered/rendered. Not for advance deposits, vehicle purchases, existing financing or insured/warranty-covered work.</p>
              <Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(offer.sunbit_service_confirmed || window.confirm("Confirm eligible services have begun and Sunbit's service restrictions are satisfied?")) onAction("set_sunbit_service",{offer_id:offer.id,confirmed:!offer.sunbit_service_confirmed});}}>{offer.sunbit_service_confirmed ? "Remove service confirmation" : "Confirm services started"}</Button>
            </div>}
            {offer.acorn_financing?.reference && <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-semibold">Acorn Finance</p><p className="text-xs">Requested: {formatMoney(offer.acorn_financing.amount_cents/100)} · {offer.acorn_financing.status?.replace(/_/g," ")}</p>
              <p className="text-xs break-all">Referral: {offer.acorn_financing.reference}</p>
              {offer.acorn_financing.customer_review&&<p className="text-xs">Legacy customer report (not used for eligibility): {offer.acorn_financing.customer_review.replace(/_/g," ")}</p>}
              <p className="text-xs text-slate-500">Confirm against Acorn's merchant dashboard or notification. This never records payment to Elite.</p>
              <AcornEmailReview offer={offer} busy={busy} onSelect={e=>{setAcornEmailId(e.id);if(e.suggested_status)setAcornStatus(e.suggested_status);setAcornEvidence("Reviewed Acorn notification received "+new Date(e.received_at).toLocaleDateString()+".");setAcornRef(offer.acorn_financing.application_reference||offer.acorn_financing.reference||"");}}/>
              {acornEmailId&&<p className="text-xs text-slate-500">Zoho notification selected. Confirm status and Acorn application reference below. <button type="button" className="underline" onClick={()=>setAcornEmailId("")}>Clear</button></p>}
              <select className="w-full border rounded p-2 text-sm" value={acornStatus} onChange={e=>setAcornStatus(e.target.value)}>{["pending","offers_received","approved","no_offers","no_suitable_offers","insufficient_amount","not_completed","technical_issue","funded"].map(x=><option key={x} value={x}>{x.replace(/_/g," ")}</option>)}</select>
              <Input placeholder="Acorn application reference" value={acornRef} onChange={e=>setAcornRef(e.target.value)}/>
              <Input placeholder="Verification source / date (no sensitive data)" value={acornEvidence} onChange={e=>setAcornEvidence(e.target.value)}/>
              <Button size="sm" variant="outline" disabled={busy||(!acornRef.trim()&&!["not_completed","technical_issue"].includes(acornStatus))||acornEvidence.trim().length<10} onClick={()=>onAction("record_acorn_status",{offer_id:offer.id,status:acornStatus,application_reference:acornRef,evidence:acornEvidence,email_id:acornEmailId})}>Record verified status</Button>
              {offer.acorn_financing.status_source==="staff_verified"&&<p className="text-xs">Staff verified · {offer.acorn_financing.application_reference}</p>}
            </div>}
            {offer.lender_option_review?.reviewed_at && <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-semibold">Customer lender review · {formatMoney(offer.lender_option_review.amount_cents/100)}</p>
              <p className="text-xs text-slate-500">Self-reported, not verified lender decisions or terms.</p>
              {(offer.lender_option_review.entries||[]).map(e=><div key={e.lender} className="text-xs border-t pt-2"><strong>{e.lender}</strong> — {e.outcome.replace(/_/g," ")}{e.approved_amount!=null&&<p>Offered: {formatMoney(e.approved_amount)}</p>}{e.apr!=null&&<p>APR: {e.apr}%</p>}{e.payment_amount!=null&&<p>Payment: {formatMoney(e.payment_amount)} (frequency not verified)</p>}{e.term_months!=null&&<p>Term: {e.term_months} months</p>}</div>)}
            </div>}
            {offer.status === "draft" && (
              <Button size="sm" disabled={busy || !(offer.line_items || []).length && !(offer.labor_items || []).length && !(offer.machining_items || []).length} onClick={() => onAction("send_offer", { offer_id: offer.id })}>
                <Send className="h-4 w-4" /> Send offer to customer
              </Button>
            )}

            {shareUrl && offer.status !== "draft" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Secure customer link</p>
                <p className="text-xs break-all text-slate-700">{shareUrl}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={copy}><Copy className="h-4 w-4" /> Copy</Button>
                  <Button size="sm" variant="outline" asChild><a href={shareUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open</a></Button>
                  {["sent", "viewed", "partially_paid"].includes(offer.status) && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction("resend_offer_email", { offer_id: offer.id })}>
                      {busy === "resend_offer_email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Resend email
                    </Button>
                  )}
                  {["sent", "viewed", "partially_paid"].includes(offer.status) && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction("revoke_offer", { offer_id: offer.id })}>
                      <Ban className="h-4 w-4" /> Revoke link
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">The link contains only a random token. The applicant can pay by card, and by lender when Stripe reports one enabled.</p>
              </div>
            )}

            <EmailDeliveryList deliveries={deliveries} busy={busy} onAction={onAction} />

            {offer.status !== "draft" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={openPayment} disabled={balance <= 0 || offer.status === "void"}>
                  <DollarSign className="h-4 w-4" /> Record offline payment
                </Button>
                {offer.status !== "void" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction("check_financing", {})}>
                    <RefreshCw className="h-4 w-4" /> Re-check lenders
                  </Button>
                )}
              </div>
            )}

            {!!(offer.financing_availability || []).length && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lender status at last check</p>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  {offer.financing_availability.filter((m) => m.type !== "us_bank_account").map((method) => (
                    <div key={method.type} className="flex justify-between text-xs">
                      <span className="text-slate-600">{method.label}</span>
                      <span className={method.available ? "text-emerald-700" : "text-slate-400"}>{method.available ? "enabled" : "off"}</span>
                    </div>
                  ))}
                </div>
                {offer.financing_note && <p className="text-[11px] text-slate-500 mt-1">{offer.financing_note}</p>}
              </div>
            )}

            {!!(offer.payments || []).length && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Payments</p>
                <div className="divide-y divide-slate-100">
                  {offer.payments.map((payment, index) => (
                    <div key={index} className="flex items-center justify-between gap-2 py-1.5">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 capitalize">
                          {String(payment.method || "").replace(/_/g, " ")}
                          {payment.financed ? " · financed" : ""}
                          {["deposit", "deposit_lender"].includes(payment.amount_option) ? " · deposit" : ""}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {payment.date} · {payment.provider || "manual"}
                          {payment.financed ? ` · financed ${formatMoney(payment.financed_amount)}` : ""}
                          {payment.stripe_payment_intent ? ` · ${payment.stripe_payment_intent}` : ""}
                          {payment.note ? ` · ${payment.note}` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{formatMoney(payment.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record an offline payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Amount</Label>
              <Input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card (recorded manually)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Check number, authorization reference…" className="mt-1" />
            </div>
            {depositOutstanding > 0 && (
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <Checkbox checked={applyDeposit} onCheckedChange={(value) => setApplyDeposit(value === true)} className="mt-0.5" />
                <span>Apply this payment toward the required deposit ({formatMoney(depositOutstanding)} still due)</span>
              </label>
            )}
            <p className="text-[11px] text-slate-500">Offline payments are marked as staff-recorded in the ledger. Only Stripe-verified payments show as provider-verified.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button
              disabled={busy || !(Number(payAmount) > 0)}
              onClick={() => { onAction("record_manual_payment", { offer_id: offer.id, amount: Number(payAmount), method: payMethod, note: payNote, apply_to_deposit: applyDeposit }); setPayOpen(false); }}
            >Record payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}