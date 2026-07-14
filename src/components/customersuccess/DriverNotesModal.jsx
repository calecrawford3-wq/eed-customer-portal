import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { WEEKDAY_OPTIONS, CONTACT_TIME_OPTIONS } from "@/lib/customerSuccess";

const FIELDS = [
  { key: "preferred_tracks", label: "Preferred Tracks" },
  { key: "driving_style", label: "Driving Style" },
  { key: "favorite_gearing", label: "Favorite Gearing" },
  { key: "championship_goals", label: "Championship Goals" },
  { key: "family_information", label: "Family Information" },
  { key: "future_plans", label: "Future Plans" },
  { key: "upcoming_engine_class", label: "Upcoming Engine Class" },
  { key: "other_notes", label: "Anything Important Discussed" },
];

const blank = { customer_id: "", preferred_tracks: "", driving_style: "", favorite_gearing: "", championship_goals: "", family_information: "", future_plans: "", upcoming_engine_class: "", other_notes: "", preferred_contact_time: "", preferred_contact_days: "" };

export default function DriverNotesModal({ open, onClose, customerId, customerName }) {
  const qc = useQueryClient();
  const { data: existing = [] } = useQuery({
    queryKey: ["driver-note", customerId],
    queryFn: () => base44.entities.DriverNote.filter({ customer_id: customerId }),
    enabled: !!customerId && open,
  });
  const record = existing && existing[0];
  const [form, setForm] = useState(blank);

  useEffect(() => {
    if (record) setForm({ ...blank, ...record });
    else setForm({ ...blank, customer_id: customerId });
  }, [record, customerId]);

  const saveMutation = useMutation({
    mutationFn: (data) => record ? base44.entities.DriverNote.update(record.id, data) : base44.entities.DriverNote.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver-note", customerId] });
      qc.invalidateQueries({ queryKey: ["driver-note-cs", customerId] });
      toast.success("Driver notes saved");
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Driver Notes — {customerName || "Customer"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-xs text-slate-400">Long-term relationship notes. These appear before each future follow-up to keep every conversation personal.</p>

          <div className="border rounded-lg p-3 bg-blue-50/50 space-y-3">
            <h4 className="text-sm font-semibold text-slate-800">Preferred Contact for Follow-up Calls</h4>
            <div>
              <Label>Preferred Time of Day</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {CONTACT_TIME_OPTIONS.map((opt) => (
                  <button key={opt} type="button" onClick={() => setForm((s) => ({ ...s, preferred_contact_time: opt === "Any time" ? "" : opt }))} className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-colors ${(form.preferred_contact_time || "Any time") === opt ? "bg-[#e20404] text-white border-[#e20404]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{opt}</button>
                ))}
              </div>
            </div>
            <div>
              <Label>Preferred Days</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {WEEKDAY_OPTIONS.map((d) => {
                  const selected = (form.preferred_contact_days || "").split(",").map((x) => x.trim()).includes(d);
                  return (
                    <button key={d} type="button" onClick={() => setForm((s) => {
                      const cur = (s.preferred_contact_days || "").split(",").map((x) => x.trim()).filter(Boolean);
                      const next = selected ? cur.filter((x) => x !== d) : [...cur, d];
                      return { ...s, preferred_contact_days: next.join(",") };
                    })} className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-colors ${selected ? "bg-[#e20404] text-white border-[#e20404]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{d}</button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 mt-1">Leave blank to allow any weekday. Weekend follow-ups are always auto-moved to the next weekday.</p>
            </div>
          </div>

          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Textarea rows={2} value={form[f.key] || ""} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}