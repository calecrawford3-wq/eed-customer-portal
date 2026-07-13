import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Send, CheckCircle, Package } from "lucide-react";
import { toast } from "sonner";

export default function GeneratePOModal({ open, onClose, lineItems, sourceNumber }) {
  const qc = useQueryClient();
  const [poGroups, setPoGroups] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [sentIds, setSentIds] = useState([]);

  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 500),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-created_date", 200),
  });

  useEffect(() => {
    if (open && parts.length > 0 && suppliers.length > 0 && lineItems?.length > 0) {
      buildPOGroups();
    }
  }, [open, parts, suppliers, lineItems]);

  const buildPOGroups = () => {
    const neededItems = [];

    for (const item of lineItems) {
      // Whole-kit lines: expand component parts for purchasing (labor stays out of POs)
      if (item.is_kit && Array.isArray(item.kit_components)) {
        const kitQty = Number(item.quantity) || 1;
        for (const comp of item.kit_components) {
          if (!comp.part_id) continue;
          const part = parts.find(p => p.id === comp.part_id);
          if (!part) continue;
          const needed = (Number(comp.quantity) || 1) * kitQty - (part.quantity_on_hand || 0);
          if (needed <= 0) continue;
          neededItems.push({ part, quantity_needed: needed, from_line: item });
        }
        continue;
      }
      if (!item.part_id) continue;
      const part = parts.find(p => p.id === item.part_id);
      if (!part) continue;
      const inStock = part.quantity_on_hand || 0;
      const needed = (item.quantity || 1) - inStock;
      if (needed <= 0) continue; // enough in stock

      neededItems.push({
        part,
        quantity_needed: needed,
        from_line: item,
      });
    }

    if (neededItems.length === 0) {
      setPoGroups([]);
      setGenerated(true);
      return;
    }

    // Group by supplier
    const bySupplier = {};
    for (const ni of neededItems) {
      const supplierId = ni.part.supplier_id || "unknown";
      if (!bySupplier[supplierId]) bySupplier[supplierId] = [];
      bySupplier[supplierId].push(ni);
    }

    const groups = Object.entries(bySupplier).map(([supplierId, items]) => {
      const supplier = suppliers.find(s => s.id === supplierId);
      const lineItems = items.map(ni => ({
        part_id: ni.part.id,
        part_number: ni.part.part_number,
        description: ni.part.name,
        quantity: ni.quantity_needed,
        unit_cost: ni.part.unit_cost || 0,
        total: ni.quantity_needed * (ni.part.unit_cost || 0),
        received_qty: 0,
      }));
      const subtotal = lineItems.reduce((s, l) => s + l.total, 0);
      return {
        supplierId,
        supplier,
        lineItems,
        subtotal,
        total: subtotal,
        saved: false,
        savedId: null,
      };
    });

    setPoGroups(groups);
    setGenerated(true);
    setCurrentIdx(0);
    setSentIds([]);
  };

  const createPOMutation = useMutation({
    mutationFn: async (group) => {
      const poNumber = `PO-${Date.now().toString().slice(-6)}`;
      const result = await base44.entities.PurchaseOrder.create({
        po_number: poNumber,
        supplier_id: group.supplierId !== "unknown" ? group.supplierId : "",
        status: "draft",
        order_date: new Date().toISOString().split("T")[0],
        line_items: group.lineItems,
        subtotal: group.subtotal,
        shipping_cost: 0,
        total: group.total,
        notes: `Auto-generated from ${sourceNumber}`,
      });
      return result;
    },
    onSuccess: (result, variables) => {
      const idx = poGroups.indexOf(variables);
      setPoGroups(prev => prev.map((g, i) => i === idx ? { ...g, saved: true, savedId: result.id } : g));
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success(`PO created for ${variables.supplier?.name || "Unknown Supplier"}`);
    },
  });

  const handleSendOne = async (group, idx) => {
    if (!group.savedId) {
      const result = await createPOMutation.mutateAsync(group);
      setSentIds(prev => [...prev, result.id]);
    } else {
      setSentIds(prev => [...prev, group.savedId]);
    }
    // Open mailto for supplier
    if (group.supplier?.email) {
      const subject = encodeURIComponent(`Purchase Order from Elite Engine Development`);
      const itemsText = group.lineItems.map(l => `  ${l.part_number} - ${l.description} | Qty: ${l.quantity} | Unit: $${Number(l.unit_cost).toFixed(2)}`).join("\n");
      const body = encodeURIComponent(`Dear ${group.supplier.name},\n\nPlease process the following purchase order:\n\n${itemsText}\n\nTotal: $${Number(group.total).toFixed(2)}\n\nThank you,\nElite Engine Development`);
      window.open(`mailto:${group.supplier.email}?subject=${subject}&body=${body}`, "_blank");
    }
  };

  const handleSendAll = async () => {
    for (let i = 0; i < poGroups.length; i++) {
      await handleSendOne(poGroups[i], i);
      await new Promise(r => setTimeout(r, 400));
    }
    toast.success("All POs sent!");
  };

  const current = poGroups[currentIdx];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Purchase Orders</DialogTitle>
        </DialogHeader>

        {!generated ? (
          <div className="py-8 text-center text-slate-400">Analyzing inventory...</div>
        ) : poGroups.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-slate-800">All parts are in stock!</p>
            <p className="text-slate-500 text-sm mt-1">No purchase orders needed.</p>
            <Button className="mt-4" variant="outline" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <div>
            {/* PO Navigator */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-500">
                PO {currentIdx + 1} of {poGroups.length}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={currentIdx === 0} onClick={() => setCurrentIdx(i => i - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={currentIdx === poGroups.length - 1} onClick={() => setCurrentIdx(i => i + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {current && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{current.supplier?.name || "Unknown Supplier"}</p>
                    {current.supplier?.email && <p className="text-xs text-slate-500">{current.supplier.email}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {sentIds.includes(current.savedId) && <Badge className="bg-emerald-100 text-emerald-700 border-0">Sent</Badge>}
                    {!current.supplier?.email && <Badge className="bg-amber-100 text-amber-700 border-0">No email on file</Badge>}
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">Part #</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">Description</th>
                      <th className="text-center px-4 py-2 font-medium text-slate-600">Qty Needed</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-600">Unit Cost</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.lineItems.map((l, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{l.part_number}</td>
                        <td className="px-4 py-2 text-slate-800">{l.description}</td>
                        <td className="px-4 py-2 text-center">{l.quantity}</td>
                        <td className="px-4 py-2 text-right">${Number(l.unit_cost).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-medium">${Number(l.total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={4} className="px-4 py-2 text-right text-slate-700">Total</td>
                      <td className="px-4 py-2 text-right text-[#e20404]">${Number(current.total).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="flex gap-3 mt-4 justify-end">
              <Button variant="outline" onClick={onClose}>Close</Button>
              {current && (
                <Button variant="outline" className="border-blue-300 text-blue-700" onClick={() => handleSendOne(current, currentIdx)}>
                  <Send className="w-4 h-4 mr-1" /> Send This PO
                </Button>
              )}
              <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleSendAll}>
                <Package className="w-4 h-4 mr-1" /> Create & Send All POs
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}