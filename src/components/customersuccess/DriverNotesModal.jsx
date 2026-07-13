import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

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

const blank = { customer_id: "", preferred_tracks: "", driving_style: "", favorite_gearing: "", championship_goals: "", family_information: "", future_plans: "", upcoming_engine_class: "", other_notes: "" };

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