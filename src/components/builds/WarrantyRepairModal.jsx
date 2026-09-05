import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function WarrantyRepairModal({ open, onClose, build, onConfirm }) {
  const [repairCost, setRepairCost] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRepairCost("");
      setDescription(build?.warranty_reason || "");
    }
  }, [open, build]);

  const handleSubmit = async () => {
    const cost = parseFloat(repairCost);
    if (isNaN(cost) || cost < 0) {
      toast.error("Enter a valid repair cost");
      return;
    }
    setSaving(true);
    try {
      // Create the warranty repair Expense (debit) to track the loss
      const expense = await base44.entities.Expense.create({
        expense_number: `WARR-${Date.now().toString().slice(-6)}`,
        category: "warranty_repair",
        description: `Warranty repair: ${build.engine_serial_number}${build.eed_id ? ` (${build.eed_id})` : ""} — ${description || "Warranty work"}`,
        amount: cost,
        date: new Date().toISOString().split("T")[0],
        build_id: build.id,
        source: "warranty",
        notes: `Auto-created from warranty build completion. ${description || ""}`.trim(),
      });

      // Record the repair cost + expense link on the build
      await base44.entities.EngineBuild.update(build.id, {
        warranty_repair_cost: cost,
        warranty_expense_id: expense.id,
      });

      toast.success("Warranty repair cost recorded as an expense");
      onConfirm(cost);
    } catch (e) {
      toast.error("Failed to record warranty cost: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            Complete Warranty Work
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-500">
            Record the repair cost for this warranty build. This creates an expense (debit) so you can track the loss from the warranty repair.
          </p>
          <div className="bg-purple-50 rounded-lg p-3 text-sm">
            <p className="font-semibold text-purple-800">{build?.engine_serial_number} {build?.eed_id && <span className="font-mono">({build.eed_id})</span>}</p>
            {build?.warranty_reason && (
              <p className="text-xs text-purple-600 mt-1">{build.warranty_reason}</p>
            )}
          </div>
          <div>
            <Label>Repair Cost (parts + labor) *</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={repairCost}
                onChange={(e) => setRepairCost(e.target.value)}
                placeholder="0.00"
                className="pl-7"
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">Enter 0 if no cost — the warranty work is still tracked.</p>
          </div>
          <div>
            <Label>Repair Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was wrong and what was fixed..."
              className="min-h-[80px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700 text-white"
            onClick={handleSubmit}
            disabled={saving || repairCost === ""}
          >
            {saving ? "Recording..." : "Record & Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}