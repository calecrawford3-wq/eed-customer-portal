import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, RefreshCw, Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function FundSettingsDialog({ open, onOpenChange, bootstrap, onChanged }) {
  const settings = bootstrap?.settings;
  const template = bootstrap?.template;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState("");
  const [applyUrl, setApplyUrl] = useState(bootstrap?.apply_url || "");

  useEffect(() => {
    setApplyUrl(bootstrap?.apply_url || "");
    setForm({
      fund_name: settings?.fund_name || "Affordable Engine Fund",
      fund_public_intro: settings?.fund_public_intro || "",
      default_offer_expiry_days: settings?.default_offer_expiry_days || 21,
      min_financing_amount: settings?.min_financing_amount || 3000,
      offer_terms_text: settings?.offer_terms_text || "",
      default_deposit_percent: settings?.default_deposit_percent ?? 50,
      internal_financing_enabled: settings?.internal_financing_enabled !== false,
      internal_financing_apr: settings?.internal_financing_apr ?? 0,
      internal_financing_term_months: settings?.internal_financing_term_months ?? 12,
      internal_financing_disclosure_text: settings?.internal_financing_disclosure_text || "",
    });
  }, [settings, bootstrap]);

  const invoke = async (action, data) => {
    const res = await base44.functions.invoke("engineAssistanceAdmin", { action, data });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
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
            <div>
              <Label className="text-xs">Disclosures the customer signs</Label>
              <Textarea className="mt-1 min-h-24" value={form.internal_financing_disclosure_text || ""} onChange={(e) => setForm({ ...form, internal_financing_disclosure_text: e.target.value })} />
            </div>
            <p className="text-[11px] text-slate-500">The APR and term are finalized and approved on each agreement before the customer signs. A 0% APR means no finance charge.</p>
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