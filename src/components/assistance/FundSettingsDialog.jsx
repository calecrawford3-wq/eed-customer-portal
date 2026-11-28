import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, RefreshCw, Loader2, CreditCard, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { IDENTITY_SETUP_GUIDANCE } from "@/lib/identityCopy";

export default function FundSettingsDialog({ open, onOpenChange, bootstrap, onChanged }) {
  const settings = bootstrap?.settings;
  const template = bootstrap?.template;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState("");
  const [applyUrl, setApplyUrl] = useState(bootstrap?.apply_url || "");

  useEffect(() => {
    setApplyUrl(bootstrap?.apply_url || "");
    setForm({
      acorn_enabled: settings?.acorn_enabled === true,
      split_financing_enabled_methods: settings?.split_financing_enabled_methods || Object.keys(settings?.split_financing_authorizations || {}).filter(type=>(settings.split_financing_authorizations[type]||"").trim().length>=5),
      split_financing_authorizations: settings?.split_financing_authorizations || {},
      fund_name: settings?.fund_name || "Affordable Engine Fund",
      fund_public_intro: settings?.fund_public_intro || "",
      default_offer_expiry_days: settings?.default_offer_expiry_days || 21,
      min_financing_amount: settings?.min_financing_amount || 3000,
      offer_terms_text: settings?.offer_terms_text || "",
      default_deposit_percent: settings?.default_deposit_percent ?? 50,
      internal_financing_enabled: settings?.internal_financing_enabled !== false,
      internal_financing_apr: settings?.internal_financing_apr ?? 0,
      internal_financing_term_months: settings?.internal_financing_term_months ?? 12,
      internal_financing_min_term_months: settings?.internal_financing_min_term_months ?? 3,
      internal_financing_max_term_months: settings?.internal_financing_max_term_months ?? 24,
      internal_financing_min_monthly_payment: settings?.internal_financing_min_monthly_payment ?? 100,
      internal_financing_disclosure_text: settings?.internal_financing_disclosure_text || "",
      late_fee_enabled: settings?.late_fee_enabled === true,
      late_fee_percent: settings?.late_fee_percent ?? 5,
      late_fee_grace_days: settings?.late_fee_grace_days ?? 10,
      cure_period_days: settings?.cure_period_days ?? 21,
      autopay_enabled: settings?.autopay_enabled === true,
      servicing_phone: settings?.servicing_phone || "",
      servicing_email: settings?.servicing_email || "",
      dispute_email: settings?.dispute_email || "",
      notice_address: settings?.notice_address || "",
      agreement_counsel_firm: settings?.agreement_counsel_firm || "",
      agreement_counsel_approved_by: settings?.agreement_counsel_approved_by || "",
      agreement_counsel_approved_at: settings?.agreement_counsel_approved_at || "",
      agreement_counsel_reference: settings?.agreement_counsel_reference || "",
      identity_enabled: bootstrap?.identity_settings?.enabled !== false,
      identity_required: bootstrap?.identity_settings?.required !== false,
      identity_store_last4: bootstrap?.identity_settings?.store_last4 === true,
      in_house_lending_live: settings?.in_house_lending_live === true,
    });
  }, [settings, bootstrap]);

  const invoke = async (action, data) => {
    const res = await base44.functions.invoke("engineAssistanceAdmin", { action, data });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  };

  const saveIdentity = async () => {
    setBusy("identity");
    try {
      await invoke("identity_settings", {
        enabled: form.identity_enabled === true,
        required: form.identity_required === true,
        store_last4: form.identity_store_last4 === true,
      });
      toast.success("Identity verification settings saved");
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    } finally { setBusy(""); }
  };

  const checkIdentity = async () => {
    setBusy("identity-check");
    try {
      const result = await invoke("identity_check", {});
      toast.success(result.note || "Identity availability checked");
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    } finally { setBusy(""); }
  };

  const save = async () => {
    setBusy("save");
    try {
      await invoke("update_settings", form);
      toast.success("Fund settings saved");
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    } finally { setBusy(""); }
  };

  const checkFinancing = async () => {
    setBusy("financing");
    try {
      const result = await invoke("check_financing", {});
      toast.success(result.note || "Lender availability refreshed");
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    } finally { setBusy(""); }
  };

  const rotate = async () => {
    setBusy("rotate");
    try {
      const result = await invoke("rotate_apply_token", {});
      setApplyUrl(result.apply_url);
      toast.success("New application link created. Old links no longer work.");
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    } finally { setBusy(""); }
  };

  const counsel = async (status) => {
    setBusy("counsel");
    try {
      await invoke("update_agreement_status", {
        status,
        counsel_firm: form.agreement_counsel_firm,
        counsel_approved_by: form.agreement_counsel_approved_by,
        counsel_approved_at: form.agreement_counsel_approved_at,
        counsel_reference: form.agreement_counsel_reference,
        live: status === "approved_counsel" && form.in_house_lending_live === true,
      });
      toast.success(status === "approved_counsel" ? "Counsel approval recorded" : "Template set back to draft — in-house lending is off");
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    } finally { setBusy(""); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + applyUrl);
      toast.success("Application link copied");
    } catch {
      toast.error("Copy failed — select the link manually");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Engine Assistance settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <Label className="text-xs font-semibold text-slate-600">Public application link</Label>
            <p className="break-all text-xs text-slate-700">{applyUrl ? window.location.origin + applyUrl : "—"}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={copy} disabled={!applyUrl}><Copy className="h-4 w-4" /> Copy link</Button>
              <Button size="sm" variant="outline" onClick={rotate} disabled={busy === "rotate"}>
                {busy === "rotate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Rotate link
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              Template: {template?.name || "Generic starter"} (v{template?.version_number || 1}){template?.is_generic_placeholder ? " · placeholder" : ""}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fund name</Label>
              <Input className="mt-1" value={form.fund_name || ""} onChange={(e) => setForm({ ...form, fund_name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Default offer expiry (days)</Label>
              <Input type="number" min="1" max="180" className="mt-1" value={form.default_offer_expiry_days || 21} onChange={(e) => setForm({ ...form, default_offer_expiry_days: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Financing priority amount ($)</Label>
              <Input type="number" min="0" step="100" className="mt-1" value={form.min_financing_amount || 3000} onChange={(e) => setForm({ ...form, min_financing_amount: e.target.value })} />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Deposit + Elite in-house financing</p>
              <p className="text-[11px] text-slate-500">The customer can pay a deposit and finance the rest with Elite. Terms are approved per agreement.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Offered to customers</Label>
                <Select
                  value={form.internal_financing_enabled === false ? "no" : "yes"}
                  onValueChange={(value) => setForm({ ...form, internal_financing_enabled: value === "yes" })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No — hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Default deposit %</Label>
                <Input type="number" min="10" max="90" step="5" className="mt-1" value={form.default_deposit_percent ?? 50} onChange={(e) => setForm({ ...form, default_deposit_percent: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Default APR %</Label>
                <Input type="number" min="0" max="36" step="0.5" className="mt-1" value={form.internal_financing_apr ?? 0} onChange={(e) => setForm({ ...form, internal_financing_apr: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Default term (months)</Label>
                <Input type="number" min="1" max="84" step="1" className="mt-1" value={form.internal_financing_term_months ?? 12} onChange={(e) => setForm({ ...form, internal_financing_term_months: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Shortest term (months)</Label>
                <Input type="number" min="1" max="84" step="1" className="mt-1" value={form.internal_financing_min_term_months ?? 3} onChange={(e) => setForm({ ...form, internal_financing_min_term_months: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Longest term (months)</Label>
                <Input type="number" min="1" max="84" step="1" className="mt-1" value={form.internal_financing_max_term_months ?? 24} onChange={(e) => setForm({ ...form, internal_financing_max_term_months: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Minimum monthly payment ($)</Label>
                <Input type="number" min="1" max="10000" step="25" className="mt-1" value={form.internal_financing_min_monthly_payment ?? 100} onChange={(e) => setForm({ ...form, internal_financing_min_monthly_payment: e.target.value })} />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              A term is shown to a customer only when its scheduled payment meets the minimum. The longest allowed term is derived from the actual
              balance: on $1,125 at 0% APR, 11 payments of $102.27 are offered and 12 payments of $93.75 are not.
            </p>
            <div>
              <Label className="text-xs">Disclosures the customer signs</Label>
              <Textarea className="mt-1 min-h-24" value={form.internal_financing_disclosure_text || ""} onChange={(e) => setForm({ ...form, internal_financing_disclosure_text: e.target.value })} />
            </div>
            <p className="text-[11px] text-slate-500">The APR and term are finalized and approved on each agreement before the customer signs. A 0% APR means no finance charge.</p>
          </div>

          <div className={`rounded-xl border p-3 space-y-3 ${settings?.agreement_template_status === "approved_counsel" ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"}`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-slate-600" />
              <div>
                <p className="text-sm font-semibold text-slate-800">Retail installment agreement &amp; Oklahoma counsel</p>
                <p className="text-[11px] text-slate-600">
                  {settings?.agreement_template_status === "approved_counsel"
                    ? "Recorded as approved by Oklahoma counsel."
                    : "DRAFT / NOT LEGALLY REVIEWED. In-house lending stays switched off until qualified Oklahoma counsel approves the wording."}
                </p>
                <p className="mt-1 break-all text-[10px] text-slate-500">
                  Template {settings?.agreement_template_key || "ok-retail-installment-v1"} v{settings?.agreement_template_version || 1} · hash {(settings?.agreement_template_hash || "").slice(0, 20) || "—"} · live lending {settings?.in_house_lending_live ? "ON" : "OFF"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Counsel firm</Label>
                <Input className="mt-1" value={form.agreement_counsel_firm || ""} onChange={(e) => setForm({ ...form, agreement_counsel_firm: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Approving Oklahoma attorney</Label>
                <Input className="mt-1" value={form.agreement_counsel_approved_by || ""} onChange={(e) => setForm({ ...form, agreement_counsel_approved_by: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Approval date</Label>
                <Input type="date" className="mt-1" value={form.agreement_counsel_approved_at || ""} onChange={(e) => setForm({ ...form, agreement_counsel_approved_at: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Counsel file / opinion reference</Label>
                <Input className="mt-1" value={form.agreement_counsel_reference || ""} onChange={(e) => setForm({ ...form, agreement_counsel_reference: e.target.value })} />
              </div>
            </div>
            <label className="flex items-start gap-2 text-[11px] text-slate-600">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={form.in_house_lending_live === true}
                onChange={(e) => setForm({ ...form, in_house_lending_live: e.target.checked })}
              />
              <span>Switch live in-house lending ON. Only enable this after counsel approved the template and the disclosures are ready to issue.</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy === "counsel"} onClick={() => counsel("approved_counsel")}>
                {busy === "counsel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Record counsel approval
              </Button>
              <Button size="sm" variant="outline" disabled={busy === "counsel"} onClick={() => counsel("draft")}>
                Set back to draft (lending off)
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">Nothing here is legal advice or an approval by Base44. Record only a real review by qualified Oklahoma counsel.</p>
          </div>

          <div className={`rounded-xl border p-3 space-y-3 ${bootstrap?.identity_settings?.available ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-slate-600" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">Identity verification (Stripe Identity)</p>
                <p className="text-[11px] text-slate-600">
                  {bootstrap?.identity_settings?.available
                    ? "Stripe Identity is available on the connected account. A provider-hosted document and selfie check is required before in-house terms are approved or the plan activates."
                    : "Verification unavailable — setup required. In-house approval and activation stay blocked until the provider check works or a documented owner exception is recorded."}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">{IDENTITY_SETUP_GUIDANCE}</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  Last checked {bootstrap?.identity_settings?.checked_at ? format(new Date(bootstrap.identity_settings.checked_at), "MMM d, yyyy h:mm a") : "never"}
                  {bootstrap?.identity_settings?.error ? ` · ${bootstrap.identity_settings.error}` : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Verification offered</Label>
                <Select value={form.identity_enabled === false ? "no" : "yes"} onValueChange={(value) => setForm({ ...form, identity_enabled: value === "yes" })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No — blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Required to approve / activate</Label>
                <Select value={form.identity_required === false ? "no" : "yes"} onValueChange={(value) => setForm({ ...form, identity_required: value === "yes" })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No — exception only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Store ID last four</Label>
                <Select value={form.identity_store_last4 ? "yes" : "no"} onValueChange={(value) => setForm({ ...form, identity_store_last4: value === "yes" })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No — status only</SelectItem>
                    <SelectItem value="yes">Yes (last four only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={saveIdentity} disabled={busy === "identity"}>
                {busy === "identity" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save identity settings
              </Button>
              <Button size="sm" variant="outline" onClick={checkIdentity} disabled={busy === "identity-check"}>
                {busy === "identity-check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check availability
              </Button>
            </div>
            <p className="text-[10px] text-slate-500">No Social Security number, document image, date of birth or ID number is stored in any Elite record. A document + selfie check is not an SSN check and not a credit decision.</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Late fee, cure period and autopay</p>
              <p className="text-[11px] text-slate-500">The late fee is off by default. Enable it only where Oklahoma law permits a late fee on this contract and amount.</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Late fee</Label>
                <Select value={form.late_fee_enabled ? "yes" : "no"} onValueChange={(value) => setForm({ ...form, late_fee_enabled: value === "yes" })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">Off — no late fee</SelectItem>
                    <SelectItem value="yes">On (legal review required)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Late fee % of payment</Label>
                <Input type="number" min="0" max="10" step="0.5" className="mt-1" value={form.late_fee_percent ?? 5} onChange={(e) => setForm({ ...form, late_fee_percent: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Grace days</Label>
                <Input type="number" min="0" max="60" step="1" className="mt-1" value={form.late_fee_grace_days ?? 10} onChange={(e) => setForm({ ...form, late_fee_grace_days: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Cure period (days)</Label>
                <Input type="number" min="7" max="90" step="1" className="mt-1" value={form.cure_period_days ?? 21} onChange={(e) => setForm({ ...form, cure_period_days: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Optional autopay authorization</Label>
                <Select value={form.autopay_enabled ? "yes" : "no"} onValueChange={(value) => setForm({ ...form, autopay_enabled: value === "yes" })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">Not offered — payments are manual</SelectItem>
                    <SelectItem value="yes">Offer the separate authorization</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Dispute / correction email</Label>
                <Input className="mt-1" value={form.dispute_email || ""} onChange={(e) => setForm({ ...form, dispute_email: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Servicing phone</Label>
                <Input className="mt-1" value={form.servicing_phone || ""} onChange={(e) => setForm({ ...form, servicing_phone: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Servicing email</Label>
                <Input className="mt-1" value={form.servicing_email || ""} onChange={(e) => setForm({ ...form, servicing_email: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Written-notice mailing address</Label>
                <Input className="mt-1" value={form.notice_address || ""} onChange={(e) => setForm({ ...form, notice_address: e.target.value })} placeholder="Printed in the agreement for written notices" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">Autopay is captured as a separate, optional authorization on the agreement. No card is charged automatically by this app.</p>
          </div>

          <div>
            <Label className="text-xs">Public description</Label>
            <Textarea className="mt-1 min-h-20" value={form.fund_public_intro || ""} onChange={(e) => setForm({ ...form, fund_public_intro: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Default offer terms</Label>
            <Textarea className="mt-1 min-h-24" value={form.offer_terms_text || ""} onChange={(e) => setForm({ ...form, offer_terms_text: e.target.value })} />
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><CreditCard className="h-4 w-4" /> Lender availability</p>
                <p className="text-[11px] text-slate-500">
                  {settings?.financing_checked_at ? `Last checked ${format(new Date(settings.financing_checked_at), "MMM d, yyyy h:mm a")}` : "Not checked yet"}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={checkFinancing} disabled={busy === "financing"}>
                {busy === "financing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check with Stripe
              </Button>
            </div>
            <div className="mt-2 space-y-1">
              <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={form.acorn_enabled===true} onChange={e=>setForm(f=>({...f,acorn_enabled:e.target.checked}))}/><span>Enable Acorn Finance (GLDIK)<br/><span className="text-xs text-slate-500">Enable only after Acorn confirms your engine-build business is eligible. Status sync is manual until authorized integration is configured.</span></span></label>
              <div className="border rounded-lg p-3 space-y-2 mt-2">
                <Label>Split financing</Label>
                <p className="text-xs text-slate-500">Enable separate customer-approved checkouts for eligible lenders. Use only where your merchant terms permit; an optional provider authorization reference can be retained for your records. Sunbit is limited to eligible goods or services already provided.</p>
                {[["affirm","Affirm"],["sunbit","Sunbit"],["klarna","Klarna"],["afterpay_clearpay","Afterpay"]].map(([type,label])=><div key={type} className="space-y-1">
                  <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.split_financing_enabled_methods?.includes(type)||false} onChange={e=>setForm(f=>({...f,split_financing_enabled_methods:e.target.checked?[...new Set([...(f.split_financing_enabled_methods||[]),type])]:(f.split_financing_enabled_methods||[]).filter(m=>m!==type)}))}/>{label}</label>
                  <Input aria-label={label+" provider documentation"} value={form.split_financing_authorizations?.[type]||""} placeholder="Provider reference (optional)" onChange={e=>setForm(f=>({...f,split_financing_authorizations:{...f.split_financing_authorizations,[type]:e.target.value}}))}/>
                </div>)}
              </div>
              {(settings?.financing_methods || []).map((method) => (
                <div key={method.type} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">{method.label}</span>
                  <span className={method.available ? "text-emerald-700 font-medium" : "text-slate-500"}>{method.available ? "Enabled" : "Not enabled"}</span>
                </div>
              ))}
              {!settings?.payments_enabled && (
                <p className="text-[11px] text-amber-700 pt-1">{settings?.payments_disabled_reason || "Online payments are not configured."}</p>
              )}
              {settings?.financing_check_error && <p className="text-[11px] text-amber-700">{settings.financing_check_error}</p>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={save} disabled={busy === "save"}>{busy === "save" ? "Saving…" : "Save settings"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}