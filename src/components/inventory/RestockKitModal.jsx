import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function RestockKitModal({ kit, parts, onClose }) {
  const [qty, setQty] = useState(1);
  const qc = useQueryClient();

  const restockMutation = useMutation({
    mutationFn: async () => {
      const updates = (kit.components || []).map(c => {
        const part = parts.find(p => p.id === c.part_id);
        const current = Number(part?.quantity_on_hand) || 0;
        const add = (Number(c.quantity) || 1) * qty;
        return { id: c.part_id, quantity_on_hand: current + add };
      });
      return base44.entities.Part.bulkUpdate(updates);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parts"] });
      toast.success(`Restocked ${qty} kit${qty === 1 ? "" : "s"} — component stock updated`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive Kit & Restock Components</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="font-medium text-slate-900">{kit.name}</div>
            <div className="text-sm text-slate-500 font-mono">{kit.part_number}</div>
            <p className="text-xs text-slate-500 mt-1">Enter how many kits you received. Each component's on-hand stock will increase by its per-kit quantity × kits received.</p>
          </div>
          <div>
            <Label>Number of Kits Received</Label>
            <Input type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} />
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Component</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">On Hand</th>
                  <th className="text-center px-3 py-2 font-medium text-slate-600">+Add</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">New Stock</th>
                </tr>
              </thead>
              <tbody>
                {(kit.components || []).map((c, i) => {
                  const part = parts.find(p => p.id === c.part_id);
                  const onHand = Number(part?.quantity_on_hand) || 0;
                  const add = (Number(c.quantity) || 1) * qty;
                  return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-1.5"><span className="font-mono text-xs text-slate-500">{c.part_number}</span> {c.name}</td>
                      <td className="px-3 py-1.5 text-right text-slate-600">{onHand}</td>
                      <td className="px-3 py-1.5 text-center text-emerald-600 font-medium">+{add}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-900">{onHand + add}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-[#e20404] hover:bg-[#c00303] text-white"
            disabled={restockMutation.isPending || !(kit.components || []).length}
            onClick={() => restockMutation.mutate()}
          >
            {restockMutation.isPending ? "Restocking..." : "Restock Components"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}