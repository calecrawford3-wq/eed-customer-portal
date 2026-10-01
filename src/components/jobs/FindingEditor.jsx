import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, Loader2, Plus, Trash2 } from "lucide-react";
import { formatMoney, roundMoney } from "@/lib/money";
import { toast } from "sonner";

const CONDITIONS = ["good", "worn", "damaged", "failed", "needs_inspection", "unknown"];
const ACTIONS = ["none", "inspect", "repair", "replace"];

export default function FindingEditor({ job, finding, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm(job, finding));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [partSearch, setPartSearch] = useState("");
  const [partResults, setPartResults] = useState([]);

  const charge = roundMoney(
    (form.labor_items || []).reduce((s, l) => s + (Number(l.price) || 0), 0) +
    (form.machining_items || []).reduce((s, m) => s + (Number(m.price) || 0), 0) +
    (form.outsourced_services || []).reduce((s, o) => s + (Number(o.price) || 0), 0) +
    (form.recommended_part_ids || []).reduce((s, p) => s + (Number(p.unit_price || 0) * (Number(p.quantity) || 1), 0), 0)
  );

  useEffect(() => { setForm(f => ({ ...f, estimated_customer_charge: charge })); }, [charge]);

  const searchParts = async (q) => {
    setPartSearch(q);
    if (q.length < 2) { setPartResults([]); return; }
    const res = await base44.entities.Part.filter({ name: { $regex: q, $options: "i" } }, "-created_date", 10);
    setPartResults(res.items || res || []);
  };

  const addPart = (p) => {
    const existing = (form.recommended_part_ids || []).find(x => x.part_id === p.id);
    if (existing) { setPartResults([]); setPartSearch(""); return; }
    setForm(f => ({ ...f, recommended_part_ids: [...(f.recommended_part_ids || []), { part_id: p.id, part_number: p.part_number, name: p.name, unit_price: Number(p.unit_price) || 0, quantity: 1 }] }));
    setPartResults([]); setPartSearch("");
  };

  const uploadPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (file_url) urls.push(file_url);
      }
      setForm(f => ({ ...f, photos: [...(f.photos || []), ...urls] }));
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const save = async () => {
    if (!form.component.trim()) { toast.error("Component is required"); return; }
    setSaving(true);
    try {
      const payload = { ...form, estimated_customer_charge: charge, customer_engine_id: job.customer_engine_id || "" };
      if (finding) {
        await base44.entities.TeardownFinding.update(finding.id, payload);
        toast.success("Finding updated");
      } else {
        await base44.entities.TeardownFinding.create(payload);
        toast.success("Finding logged");
      }
      onSaved();
    } catch (e) { toast.error("Save failed: " + e.message); }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{finding ? "Edit Finding" : "Log Teardown Finding"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Component *</Label><Input value={form.component} onChange={e => setForm(f => ({ ...f, component: e.target.value }))} placeholder="Crankshaft, Head #2…" /></div>
            <div><Label>Condition</Label>
              <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Measurements</Label><Textarea value={form.measurements} onChange={e => setForm(f => ({ ...f, measurements: e.target.value }))} rows={2} placeholder="Clearance, runout, wear limits…" /></div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          <div>
            <Label>Photos</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {(form.photos || []).map((url, i) => (
                <div key={i} className="relative w-16 h-16 rounded overflow-hidden border">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, photos: f.photos.filter((_, x) => x !== i) }))} className="absolute top-0 right-0 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center"><X className="w-2.5 h-2.5" /></button>
                </div>
              ))}
              <label className="w-16 h-16 rounded border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-[#e20404]">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-slate-400" />}
                <Input type="file" accept="image/*" multiple className="hidden" onChange={uploadPhotos} disabled={uploading} />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Recommended Action</Label>
              <Select value={form.recommended_action} onValueChange={v => setForm(f => ({ ...f, recommended_action: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ACTIONS.map(a => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Estimated Charge</Label><Input value={formatMoney(charge)} readOnly className="bg-slate-50 font-semibold" /></div>
          </div>
          <div>
            <Label>Recommended Parts</Label>
            <Input value={partSearch} onChange={e => searchParts(e.target.value)} placeholder="Search parts by name…" className="mb-1" />
            {partResults.length > 0 && (
              <div className="border rounded max-h-32 overflow-y-auto text-sm">
                {partResults.map(p => <button key={p.id} type="button" onClick={() => addPart(p)} className="block w-full text-left px-2 py-1 hover:bg-slate-50">{p.name} <span className="text-xs text-slate-400">{p.part_number}</span></button>)}
              </div>
            )}
            {(form.recommended_part_ids || []).length > 0 && (
              <div className="space-y-1 mt-1">
                {form.recommended_part_ids.map((p, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 rounded px-2 py-1 text-sm">
                    <span>{p.name} <span className="text-xs text-slate-400">×{p.quantity}</span></span>
                    <button type="button" onClick={() => setForm(f => ({ ...f, recommended_part_ids: f.recommended_part_ids.filter((_, x) => x !== i) }))} className="text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <ItemGroup label="Labor" items={form.labor_items} onChange={v => setForm(f => ({ ...f, labor_items: v }))} />
          <ItemGroup label="Machining" items={form.machining_items} onChange={v => setForm(f => ({ ...f, machining_items: v }))} />
          <ItemGroup label="Outsourced Services" items={form.outsourced_services} onChange={v => setForm(f => ({ ...f, outsourced_services: v }))} withVendor />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303]" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Finding"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemGroup({ label, items, onChange, withVendor }) {
  const list = items || [];
  return (
    <div>
      <div className="flex items-center justify-between"><Label>{label}</Label>
        <Button type="button" size="sm" variant="ghost" className="h-6 text-xs text-[#e20404]" onClick={() => onChange([...list, { name: "", description: "", price: 0, ...(withVendor ? { vendor: "" } : {}) }])}><Plus className="w-3 h-3 mr-0.5" /> Add</Button>
      </div>
      {list.map((it, i) => (
        <div key={i} className="grid grid-cols-12 gap-1 mt-1 items-center">
          <Input className="col-span-4 h-8 text-sm" placeholder="Name" value={it.name} onChange={e => updateAt(onChange, list, i, { name: e.target.value })} />
          {withVendor ? <Input className="col-span-3 h-8 text-sm" placeholder="Vendor" value={it.vendor || ""} onChange={e => updateAt(onChange, list, i, { vendor: e.target.value })} /> : <Input className="col-span-3 h-8 text-sm" placeholder="Description" value={it.description || ""} onChange={e => updateAt(onChange, list, i, { description: e.target.value })} />}
          <Input className="col-span-4 h-8 text-sm" placeholder="Description" value={it.description || ""} onChange={e => updateAt(onChange, list, i, { description: e.target.value })} />
          <Input type="number" className="col-span-1 h-8 text-sm" placeholder="$" value={it.price} onChange={e => updateAt(onChange, list, i, { price: Number(e.target.value) || 0 })} />
        </div>
      ))}
    </div>
  );
}
function updateAt(onChange, list, i, patch) { onChange(list.map((x, x_i) => x_i === i ? { ...x, ...patch } : x)); }
function emptyForm(job, finding) {
  if (finding) return { ...finding, photos: finding.photos || [], recommended_part_ids: finding.recommended_part_ids || [], labor_items: finding.labor_items || [], machining_items: finding.machining_items || [], outsourced_services: finding.outsourced_services || [] };
  return { job_id: job.id, component: "", condition: "needs_inspection", measurements: "", notes: "", photos: [], recommended_action: "none", recommended_part_ids: [], labor_items: [], machining_items: [], outsourced_services: [], estimated_customer_charge: 0, status: "open", inspected_by: "" };
}