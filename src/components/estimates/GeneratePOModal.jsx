import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Send, CheckCircle, Package, Save, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import PoPartPickerModal from "./PoPartPickerModal";

export default function GeneratePOModal({ open, onClose, lineItems, sourceNumber }) {
  const qc = useQueryClient();
  const [poGroups, setPoGroups] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [sentIds, setSentIds] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

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
      setPoGroups(prev => prev.map(g => g.supplierId === variables.supplierId ? { ...g, saved: true, savedId: result.id } : g));
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success(`PO created for ${variables.supplier?.name || "Unknown Supplier"}`);
    },
  });

  const recalcGroup = (group) => {
    const lineItems = group.lineItems.map(l => ({ ...l, total: (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0) }));
    const subtotal = lineItems.reduce((s, l) => s + l.total, 0);
    return { ...group, lineItems, subtotal, total: subtotal };
  };

  const updateLineItem = (groupIdx, itemIdx, field, value) => {
    setPoGroups(prev => prev.map((g, i) => {
      if (i !== groupIdx) return g;
      const newItems = g.lineItems.map((l, j) => j === itemIdx ? { ...l, [field]: value } : l);
      return recalcGroup({ ...g, lineItems: newItems });
    }));
  };

  const removeLineItem = (groupIdx, itemIdx) => {
    setPoGroups(prev => prev.map((g, i) => {
      if (i !== groupIdx) return g;
      const newItems = g.lineItems.filter((_, j) => j !== itemIdx);
      return recalcGroup({ ...g, lineItems: newItems });
    }));
  };

  const addPartToGroup = (groupIdx, newLine) => {
    setPoGroups(prev => prev.map((g, i) => {
      if (i !== groupIdx) return g;
      // Avoid duplicate part_id entries — merge qty if already present
      const existingIdx = g.lineItems.findIndex(l => l.part_id && l.part_id === newLine.part_id);
      let newItems;
      if (existingIdx >= 0) {
        newItems = g.lineItems.map((l, j) => j === existingIdx
          ? { ...l, quantity: (Number(l.quantity) || 0) + (Number(newLine.quantity) || 0) }
          : l);
      } else {
        newItems = [...g.lineItems, newLine];
      }
      return recalcGroup({ ...g, lineItems: newItems });
    }));
    toast.success(`${newLine.description} added to PO`);
  };

  const handleSaveOne = async (group, idx) => {
    if (group.savedId) {
      toast.info("This PO is already saved");
      return;
    }
    const result = await createPOMutation.mutateAsync(group);
    return result;
  };

  const handleSaveAll = async () => {
    for (let i = 0; i < poGroups.length; i++) {
      if (!poGroups[i].savedId) {
        await createPOMutation.mutateAsync(poGroups[i]);
        await new Promise(r => setTimeout(r, 200));
      }
    }
    toast.success("All POs saved!");
  };

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
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
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
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
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
                    <Button size="sm" variant="outline" className="border-slate-300" onClick={() => setPickerOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Add Part
                    </Button>
                  </div>
                </div>
                <div className="overflow-y-auto max-h-[50vh]">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 sticky top-0 bg-white">
                    <tr>
                      <th className="text-left px-2 py-2 font-medium text-slate-600">Part #</th>
                      <th className="text-left px-2 py-2 font-medium text-slate-600">Description</th>
                      <th className="text-center px-2 py-2 font-medium text-slate-600">Qty</th>
                      <th className="text-right px-2 py-2 font-medium text-slate-600">Unit Cost</th>
                      <th className="text-right px-2 py-2 font-medium text-slate-600">Total</th>
                      <th className="px-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.lineItems.map((l, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-2 py-1.5">
                          <input
                            className="font-mono text-xs text-slate-600 w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 rounded px-1 py-1 outline-none"
                            value={l.part_number || ""}
                            onChange={(e) => updateLineItem(currentIdx, i, "part_number", e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className="text-slate-800 w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 rounded px-1 py-1 outline-none"
                            value={l.description || ""}
                            onChange={(e) => updateLineItem(currentIdx, i, "description", e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center align-top">
                          <input
                            type="number"
                            min="0"
                            className="w-16 text-center bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 rounded px-1 py-1 outline-none"
                            value={l.quantity}
                            onChange={(e) => updateLineItem(currentIdx, i, "quantity", Number(e.target.value) || 0)}
                          />
                          {(() => {
                            const stockPart = parts.find(p => p.id === l.part_id);
                            const onHand = stockPart?.quantity_on_hand ?? 0;
                            const stockClass = onHand > 0 ? "text-emerald-600" : "text-slate-400";
                            return (
                              <div className={`text-[10px] font-medium ${stockClass} mt-0.5`}>
                                {onHand} in stock
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <div className="flex items-center justify-end">
                            <span className="text-slate-400 text-sm mr-0.5">$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-20 text-right bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 rounded px-1 py-1 outline-none"
                              value={l.unit_cost}
                              onChange={(e) => updateLineItem(currentIdx, i, "unit_cost", Number(e.target.value) || 0)}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium">${Number(l.total).toFixed(2)}</td>
                        <td className="px-1 py-1.5 text-center">
                          <button
                            className="text-slate-300 hover:text-red-500 transition-colors p-1"
                            onClick={() => removeLineItem(currentIdx, i)}
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={4} className="px-4 py-2 text-right text-slate-700">Total</td>
                      <td className="px-4 py-2 text-right text-[#e20404]">${Number(current.total).toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                  </table>
                  </div>
                  </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-4 justify-end">
              <Button variant="outline" onClick={onClose}>Close</Button>
              {current && (
                <Button
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  disabled={current.saved || createPOMutation.isPending}
                  onClick={() => handleSaveOne(current, currentIdx)}
                >
                  <Save className="w-4 h-4 mr-1" /> {current.saved ? "Saved" : "Save This PO"}
                </Button>
              )}
              <Button
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                disabled={poGroups.every(g => g.saved)}
                onClick={handleSaveAll}
              >
                <Save className="w-4 h-4 mr-1" /> Save All POs
              </Button>
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
      {current && (
        <PoPartPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          parts={parts}
          suppliers={suppliers}
          currentSupplierId={current.supplierId}
          currentSupplierName={current.supplier?.name}
          existingPartIds={current.lineItems.map(l => l.part_id).filter(Boolean)}
          onAdd={(newLine) => addPartToGroup(currentIdx, newLine)}
        />
      )}
    </Dialog>
  );
}