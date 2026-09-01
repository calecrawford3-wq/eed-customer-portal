import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CannedItemsEditor from "@/components/specsheets/CannedItemsEditor";

export default function CannedJobDialog({ open, onClose, cannedJob, onSave, isPending }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [cannedItems, setCannedItems] = useState({ line_items: [], labor_items: [], machining_items: [] });

  useEffect(() => {
    if (cannedJob) {
      setName(cannedJob.name || "");
      setDescription(cannedJob.description || "");
      setStatus(cannedJob.status || "active");
      setNotes(cannedJob.notes || "");
      setCannedItems({
        line_items: cannedJob.line_items || [],
        labor_items: cannedJob.labor_items || [],
        machining_items: cannedJob.machining_items || [],
      });
    } else {
      setName("");
      setDescription("");
      setStatus("active");
      setNotes("");
      setCannedItems({ line_items: [], labor_items: [], machining_items: [] });
    }
  }, [cannedJob, open]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      status,
      notes: notes.trim(),
      line_items: cannedItems.line_items || [],
      labor_items: cannedItems.labor_items || [],
      machining_items: cannedItems.machining_items || [],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cannedJob ? "Edit Canned Job" : "New Canned Job"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., GSX600 Stage 2 Refresh" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description shown in the picker..." />
          </div>
          <CannedItemsEditor cannedItems={cannedItems} onChange={setCannedItems} showMachining />
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes..." rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} className="bg-[#e20404] hover:bg-[#c00303] text-white" disabled={!name.trim() || isPending}>
              {cannedJob ? "Save Changes" : "Create Canned Job"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}