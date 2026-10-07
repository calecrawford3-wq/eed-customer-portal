import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { formatMoney, roundMoney } from "@/lib/money";
import { toast } from "sonner";
import FindingPhotoManager from "@/components/findings/FindingPhotoManager";

const CONDITIONS = ["good", "worn", "damaged", "failed", "needs_inspection", "unknown"];
const ACTIONS = ["none", "inspect", "repair", "replace"];

export default function FindingEditor({ job, finding, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm(job, finding));
  const [saving, setSaving] = useState(false);
  const [partSearch, setPartSearch] = useState("");
  const [partResults, setPartResults] = useState([]);
  // Existing photos (loaded from backend for edit mode). null = loading, [] = ready.
  const [existingPhotos, setExistingPhotos] = useState(finding ? null : []);
  const [photoSlots, setPhotoSlots] = useState([]);
  const [originalPhotoIds, setOriginalPhotoIds] = useState([]);

  const charge = roundMoney(
    (form.labor_items || []).reduce((s, l) => s + (Number(l.price) || 0), 0) +
    (form.machining_items || []).reduce((s, m) => s + (Number(m.price) || 0) * (Number(m.quantity) || 1), 0) +
    (form.outsourced_services || []).reduce((s, o) => s + (Number(o.price) || 0), 0) +
    (form.recommended_part_ids || []).reduce((s, p) => s + (Number(p.unit_price || 0) * (Number(p.quantity) || 1), 0), 0)
  );

  useEffect(() => { setForm(f => ({ ...f, estimated_customer_charge: charge })); }, [charge]);

  // Load existing photos (with signed URLs) when editing
  useEffect(() => {
    if (!finding) { setExistingPhotos([]); return; }
    (async () => {
      try {
        const res = await base44.functions.invoke("getFindingPhotosAdmin", { finding_ids: [finding.id] });
        const photos = res?.data?.photos || [];
        setExistingPhotos(photos);
        setOriginalPhotoIds(photos.map((p) => p.id));
      } catch (e) {
        console.error("load photos failed", e);
        setExistingPhotos([]);
      }
    })();
  }, [finding]);

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

  const save = async () => {
    if (!form.component.trim()) { toast.error("Component is required"); return; }
    setSaving(true);
    try {
      const payload = {
        job_id: job.id,
        customer_engine_id: job.customer_engine_id || "",
        component: form.component.trim(),
        condition: form.condition,
        measurements: form.measurements,
        notes: form.notes,
        customer_description: form.customer_description,
        recommended_action: form.recommended_action,
        recommended_part_ids: form.recommended_part_ids,
        labor_items: form.labor_items,
        machining_items: form.machining_items,
        outsourced_services: form.outsourced_services,
        estimated_customer_charge: charge,
        status: form.status || "open",
        inspected_by: form.inspected_by || "",
      };

      let findingId = finding?.id;
      if (finding) {
        await base44.entities.TeardownFinding.update(finding.id, payload);
        toast.success("Finding updated");
      } else {
        const created = await base44.entities.TeardownFinding.create(payload);
        findingId = created.id;
        toast.success("Finding logged");
      }

      // Persist photos (skip any still uploading or failed)
      await persistPhotos(findingId);

      onSaved();
    } catch (e) { toast.error("Save failed: " + e.message); }
    setSaving(false);
  };

  const persistPhotos = async (findingId) => {
    if (!findingId) return;
    const customerId = job.customer_id || "";
    const engineId = job.customer_engine_id || "";
    const currentExisting = photoSlots.filter((s) => s.id);
    const newSlots = photoSlots.filter((s) => !s.id && s.file_uri && s._status === "uploaded");

    // Update existing (caption/share/cover/order)
    if (currentExisting.length > 0) {
      try {
        await base44.entities.FindingPhoto.bulkUpdate(
          currentExisting.map((s) => ({
            id: s.id,
            caption: s.caption || "",
            share_with_customer: !!s.share_with_customer,
            is_cover: !!s.is_cover,
            sort_order: Number(s.sort_order) || 0,
          }))
        );
      } catch (e) { console.error("photo update failed", e); }
    }

    // Create new
    if (newSlots.length > 0) {
      try {
        await base44.entities.FindingPhoto.bulkCreate(
          newSlots.map((s, i) => ({
            finding_id: findingId,
            job_id: job.id,
            customer_id: customerId,
            customer_engine_id: engineId,
            file_uri: s.file_uri,
            caption: s.caption || "",
            share_with_customer: !!s.share_with_customer,
            is_cover: !!s.is_cover,
            sort_order: Number(s.sort_order) || i,
          }))
        );
      } catch (e) { console.error("photo create failed", e); }
    }

    // Delete removed existing photos
    const currentIds = new Set(currentExisting.map((s) => s.id));
    const deletedIds = originalPhotoIds.filter((id) => !currentIds.has(id));
    for (const id of deletedIds) {
      try { await base44.entities.FindingPhoto.delete(id); } catch (e) { /* ignore */ }
    }
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
          <div><Label>Measurements <span className="text-xs text-slate-400 font-normal">(private)</span></Label><Textarea value={form.measurements} onChange={e => setForm(f => ({ ...f, measurements: e.target.value }))} rows={2} placeholder="Clearance, runout, wear limits…" /></div>
          <div><Label>Notes <span className="text-xs text-slate-400 font-normal">(private)</span></Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          <div><Label>Customer-facing explanation <span className="text-xs text-slate-400 font-normal">(shown in portal & approval)</span></Label><Textarea value={form.customer_description} onChange={e => setForm(f => ({ ...f, customer_description: e.target.value }))} rows={2} placeholder="Plain-language summary the customer will see beside the photos" /></div>

          <div>
            <Label>Photos</Label>
            {existingPhotos === null ? (
              <div className="h-20 flex items-center justify-center text-sm text-slate-400">Loading photos…</div>
            ) : (
              <FindingPhotoManager
                key={finding?.id || "new"}
                existingPhotos={existingPhotos}
                onChange={setPhotoSlots}
              />
            )}
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
  if (finding) return { ...finding, customer_description: finding.customer_description || "", recommended_part_ids: finding.recommended_part_ids || [], labor_items: finding.labor_items || [], machining_items: finding.machining_items || [], outsourced_services: finding.outsourced_services || [] };
  return { job_id: job.id, component: "", condition: "needs_inspection", measurements: "", notes: "", customer_description: "", recommended_action: "none", recommended_part_ids: [], labor_items: [], machining_items: [], outsourced_services: [], estimated_customer_charge: 0, status: "open", inspected_by: "" };
}