import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HandCoins, Loader2, MessageSquareWarning } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money";

const when = (value) => (value ? format(new Date(value), "MMM d, yyyy h:mm a") : "");

// Borrower disputes and post-referral recoveries. Both are recorded by hand:
// nothing is disputed, collected or reported automatically.
export default function CaseDisputesRecoveries({ caseDoc, onChanged }) {
  const [busy, setBusy] = useState("");
  const [summary, setSummary] = useState("");
  const [resolution, setResolution] = useState({});
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("borrower");
  const [note, setNote] = useState("");

  const invoke = async (action, data) => {
    setBusy(action);
    try {
      const res = await base44.functions.invoke("engineAssistanceCollections", { action, data });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.note) toast.success(res.data.note);
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || "The action could not be completed");
    } finally {
      setBusy("");
    }
  };

  if (!caseDoc) return null;
  const disputes = Array.isArray(caseDoc.disputes) ? caseDoc.disputes : [];
  const recoveries = Array.isArray(caseDoc.recoveries) ? caseDoc.recoveries : [];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 p-3 space-y-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><MessageSquareWarning className="h-3.5 w-3.5" /> Disputes and corrections</p>
        {!disputes.length ? <p className="text-[11px] text-slate-500">No disputes recorded.</p> : disputes.map((dispute, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <p className="text-[11px] font-semibold text-slate-800">{dispute.summary}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${dispute.status === "resolved" ? "bg-emerald-100 text-emerald-800" : dispute.status === "withdrawn" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-800"}`}>{dispute.status}</span>
            </div>
            <p className="text-[10px] text-slate-500">Opened {when(dispute.opened_at)} by {dispute.opened_by}</p>
            {dispute.resolution && <p className="text-[10px] text-slate-600">{dispute.resolution} · {when(dispute.resolved_at)} by {dispute.resolved_by}</p>}
            {["open", "investigating"].includes(dispute.status) && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Input className="max-w-xs" value={resolution[index] || ""} onChange={(event) => setResolution({ ...resolution, [index]: event.target.value })} placeholder="Resolution note" />
                <Button size="sm" variant="outline" disabled={!!busy || !(resolution[index] || "").trim()} onClick={() => invoke("dispute_resolve", { case_id: caseDoc.id, index, outcome: "resolved", resolution: resolution[index] })}>Resolve</Button>
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => invoke("dispute_resolve", { case_id: caseDoc.id, index, outcome: "investigating", resolution: resolution[index] || "" })}>Investigating</Button>
              </div>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-sm" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Borrower dispute or correction request" />
          <Button size="sm" variant="outline" disabled={!!busy || !summary.trim()} onClick={() => { invoke("dispute_open", { case_id: caseDoc.id, summary }); setSummary(""); }}>
            {busy === "dispute_open" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Record dispute
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-3 space-y-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><HandCoins className="h-3.5 w-3.5" /> Recoveries</p>
        {!recoveries.length ? <p className="text-[11px] text-slate-500">No recoveries recorded.</p> : (
          <div className="space-y-0.5">
            {recoveries.map((recovery, index) => (
              <p key={index} className="flex justify-between gap-2 text-[11px] text-slate-600">
                <span>{when(recovery.at)} · {recovery.source}{recovery.note ? ` · ${recovery.note}` : ""}</span>
                <span className="tabular-nums font-semibold text-slate-900">{formatMoney(recovery.amount)}</span>
              </p>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div>
            <Label className="text-[11px]">Amount</Label>
            <Input type="number" min="0" step="0.01" className="mt-1" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <div>
            <Label className="text-[11px]">From</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="borrower">Borrower</SelectItem>
                <SelectItem value="collection_agency">Collection agency</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-[11px]">Note</Label>
            <Input className="mt-1" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Agency remittance, partial payment…" />
          </div>
        </div>
        <Button size="sm" variant="outline" disabled={!!busy || !(Number(amount) > 0)} onClick={() => { invoke("recovery_record", { case_id: caseDoc.id, amount: Number(amount), source, note }); setAmount(""); setNote(""); }}>
          Record recovery
        </Button>
        <p className="text-[10px] text-slate-400">Recoveries are recorded on the case only. Installments themselves stay on the agreement so money is never counted twice.</p>
      </div>
    </div>
  );
}