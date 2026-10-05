import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatMoney, roundMoney } from "@/lib/money";
import { toast } from "sonner";

export default function AdditionalWorkDialog({ job, findings, onClose, onSaved }) {
  const [title, setTitle] = useState(`Additional Work — ${findings.length} finding(s)`);
  const [description, setDescription] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [saving, setSaving] = useState(false);

  // Aggregate parts, labor, machining, outsourced from selected findings
  const agg = useMemo(() => aggregate(findings), [findings]);
  const subtotal = roundMoney(agg.partsTotal + agg.laborTotal + agg.machTotal + agg.outsourceTotal);
  const taxAmount = roundMoney(subtotal * (Number(taxRate) || 0) / 100);
  const total = roundMoney(subtotal + taxAmount);

  const save = async () => {
    if (findings.length === 0) { toast.error("No findings selected"); return; }
    setSaving(true);
    try {
      const countRes = await base44.entities.AdditionalWork.filter({ job_id: job.id });
      const num = `AW-${String((countRes.items || countRes || []).length + 1).padStart(4, "0")}`;
      const now = new Date().toISOString();
      const aw = await base44.entities.AdditionalWork.create({
        work_number: num, job_id: job.id, customer_id: job.customer_id, customer_engine_id: job.customer_engine_id || "",
        title, description, finding_ids: findings.map(f => f.id),
        line_items: agg.lineItems, labor_items: agg.laborItems, machining_items: agg.machiningItems, outsourced_services: agg.outsourceItems,
        subtotal, tax_rate: Number(taxRate) || 0, tax_amount: taxAmount, total,
        public_access_token: crypto.randomUUID(),
        customer_response: "pending",
        status: "pending", version: 1, submitted_at: now,
        version_history: [{ version: 1, changed_at: now, changed_by: "admin", reason: "created", total }],
      });
      // Mark findings selected
      for (const f of findings) {
        await base44.entities.TeardownFinding.update(f.id, { status: "selected", additional_work_id: aw.id });
      }
      toast.success(`${num} created — pending approval`);
      onSaved();
    } catch (e) { toast.error("Failed: " + e.message); }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Generate Additional-Work Approval</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {findings.map(f => <Badge key={f.id} variant="outline" className="text-xs">{f.component}</Badge>)}
          </div>
          <div><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div><Label>Description (shown to customer)</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
          <div className="border rounded p-3 space-y-1 text-sm bg-slate-50">
            <Row label="Parts" value={formatMoney(agg.partsTotal)} />
            <Row label="Labor" value={formatMoney(agg.laborTotal)} />
            <Row label="Machining" value={formatMoney(agg.machTotal)} />
            <Row label="Outsourced" value={formatMoney(agg.outsourceTotal)} />
            <Row label="Subtotal" value={formatMoney(subtotal)} bold />
            <div className="flex items-center justify-between pt-1">
              <Label className="text-xs">Tax Rate %</Label>
              <Input type="number" value={taxRate} onChange={e => setTaxRate(e.target.value)} className="w-20 h-8" step="0.01" />
            </div>
            <Row label="Tax" value={formatMoney(taxAmount)} />
            <Row label="Total" value={formatMoney(total)} bold />
          </div>
          <p className="text-xs text-slate-400">The original approved estimate is preserved. This request is pending until approved — pending or declined work is never billed.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303]" onClick={save} disabled={saving}>{saving ? "Creating…" : "Create Pending Approval"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold }) {
  return <div className="flex items-center justify-between"><span className="text-slate-500">{label}</span><span className={bold ? "font-semibold text-slate-900" : "text-slate-700"}>{value}</span></div>;
}

function aggregate(findings) {
  const partMap = new Map();
  const laborItems = [];
  const machiningItems = [];
  const outsourceItems = [];
  for (const f of findings || []) {
    for (const p of (f.recommended_part_ids || [])) {
      const key = p.part_id || p.name;
      if (partMap.has(key)) { partMap.get(key).quantity += Number(p.quantity) || 1; }
      else { partMap.set(key, { part_id: p.part_id || "", part_number: p.part_number || "", item_name: p.name || "", quantity: Number(p.quantity) || 1, unit_cost: 0, unit_price: Number(p.unit_price) || 0, total: roundMoney((Number(p.unit_price) || 0) * (Number(p.quantity) || 1)) }); }
    }
    for (const l of (f.labor_items || [])) laborItems.push({ name: l.name, description: `${f.component}: ${l.description || ""}`, price: Number(l.price) || 0 });
    for (const m of (f.machining_items || [])) machiningItems.push({ name: m.name, description: `${f.component}: ${m.description || ""}`, price: Number(m.price) || 0 });
    for (const o of (f.outsourced_services || [])) outsourceItems.push({ name: o.name, vendor: o.vendor || "", description: `${f.component}: ${o.description || ""}`, price: Number(o.price) || 0 });
  }
  const lineItems = [...partMap.values()];
  const partsTotal = lineItems.reduce((s, li) => s + li.total, 0);
  const laborTotal = laborItems.reduce((s, l) => s + l.price, 0);
  const machTotal = machiningItems.reduce((s, m) => s + m.price, 0);
  const outsourceTotal = outsourceItems.reduce((s, o) => s + o.price, 0);
  return { lineItems, laborItems, machiningItems, outsourceItems, partsTotal: roundMoney(partsTotal), laborTotal: roundMoney(laborTotal), machTotal: roundMoney(machTotal), outsourceTotal: roundMoney(outsourceTotal) };
}