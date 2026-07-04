import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function OrderKitModal({ kit, suppliers, onClose }) {
  const [qty, setQty] = useState(1);
  const qc = useQueryClient();
  const supplier = suppliers.find(s => s.id === kit.supplier_id);

  const lineItems = (kit.components || []).map(c => ({
    part_id: c.part_id,
    part_number: c.part_number,
    description: c.name,
    quantity: (Number(c.quantity) || 1) * qty,
    unit_cost: Number(c.unit_cost) || 0,
    total: (Number(c.unit_cost) || 0) * (Number(c.quantity) || 1) * qty,
  }));
  const subtotal = lineItems.reduce((s, li) => s + li.total, 0);

  const orderMutation = useMutation({
    mutationFn: async () => {
      const poNumber = `PO-KIT-${Date.now().toString().slice(-8)}`;
      return base44.entities.PurchaseOrder.create({
        po_number: poNumber,
        supplier_id: kit.supplier_id,
        status: "draft",
        order_date: new Date().toISOString().slice(0, 10),
        line_items: lineItems,
        subtotal,
        shipping_cost: 0,
        total: subtotal,
        notes: `Kit order: ${kit.name} (${kit.part_number}) x${qty}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
      toast.success("Purchase order created for kit");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Order Kit from Vendor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="font-medium text-slate-900">{kit.name}</div>
            <div className="text-sm text-slate-500 font-mono">{kit.part_number}</div>
            <div className="text-sm mt-1">
              Vendor: {supplier ? supplier.name : <span className="text-red-500 font-medium">No vendor assigned — assign one first</span>}
            </div>
          </div>
          <div>
            <Label>Number of Kits to Order</Label>
            <Input type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} />
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Component</th>
                  <th className="text-center px-3 py-2 font-medium text-slate-600">Per Kit</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Order Qty</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(kit.components || []).map((c, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-1.5"><span className="font-mono text-xs text-slate-500">{c.part_number}</span> {c.name}</td>
                    <td className="px-3 py-1.5 text-center">{c.quantity}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{(Number(c.quantity) || 1) * qty}</td>
                    <td className="px-3 py-1.5 text-right">${((Number(c.unit_cost) || 0) * (Number(c.quantity) || 1) * qty).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-right font-medium text-slate-900">PO Total: ${subtotal.toFixed(2)}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-[#e20404] hover:bg-[#c00303] text-white"
            disabled={!kit.supplier_id || orderMutation.isPending}
            onClick={() => orderMutation.mutate()}
          >
            {orderMutation.isPending ? "Creating PO..." : "Create Purchase Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}