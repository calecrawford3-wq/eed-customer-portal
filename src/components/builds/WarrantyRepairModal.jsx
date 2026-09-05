import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Search, Plus, Trash2, Package, Boxes, FileText, X } from "lucide-react";
import { toast } from "sonner";

export default function WarrantyRepairModal({ open, onClose, build, onConfirm }) {
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Inventory browsing
  const [browseType, setBrowseType] = useState("part"); // 'part' | 'core'
  const [parts, setParts] = useState([]);
  const [cores, setCores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Selected items (unified): { uid, source: 'inventory'|'po', item_type: 'part'|'core', ref_id, name, sku, unit_cost, qty, available, po_id, po_number }
  const [selected, setSelected] = useState([]);

  // PO attachment
  const [pos, setPos] = useState([]);
  const [poSearch, setPoSearch] = useState("");
  const [attachedPOs, setAttachedPOs] = useState([]); // { id, po_number, supplier_name, total }

  // Labor
  const [laborHours, setLaborHours] = useState("");
  const [laborRate, setLaborRate] = useState("");

  useEffect(() => {
    if (open) {
      setDescription(build?.warranty_reason || "");
      setSelected([]);
      setAttachedPOs([]);
      setLaborHours("");
      setLaborRate("");
      setSearch("");
      setPoSearch("");
      setBrowseType("part");
    }
  }, [open, build]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      base44.entities.Part.list("-updated_date", 500).catch(() => []),
      base44.entities.EngineCore.list("-updated_date", 500).catch(() => []),
      base44.entities.PurchaseOrder.list("-updated_date", 200).catch(() => []),
    ]).then(([p, c, po]) => {
      setParts(Array.isArray(p) ? p : []);
      setCores(Array.isArray(c) ? c : []);
      setPos(Array.isArray(po) ? po : []);
    }).finally(() => setLoading(false));
  }, [open]);

  const inventoryResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const source = browseType === "part" ? parts : cores;
    const skuField = browseType === "part" ? "part_number" : "core_number";
    return source
      .filter(p =>
        !selected.find(s => s.ref_id === p.id && s.item_type === browseType) &&
        (p.name?.toLowerCase().includes(q) || p[skuField]?.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [parts, cores, search, browseType, selected]);

  const poResults = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    if (!q) return [];
    return pos
      .filter(p => !attachedPOs.find(a => a.id === p.id))
      .filter(p => p.po_number?.toLowerCase().includes(q) || (p.supplier_name || "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [pos, poSearch, attachedPOs]);

  const partsCost = useMemo(
    () => selected.reduce((sum, s) => sum + (Number(s.unit_cost) || 0) * (Number(s.qty) || 0), 0),
    [selected]
  );

  const laborCost = useMemo(() => {
    const h = parseFloat(laborHours) || 0;
    const r = parseFloat(laborRate) || 0;
    return h * r;
  }, [laborHours, laborRate]);

  const total = partsCost + laborCost;

  const addInventoryItem = (p, type) => {
    const skuField = type === "part" ? "part_number" : "core_number";
    setSelected(prev => [...prev, {
      uid: `${type}-${p.id}`,
      source: "inventory",
      item_type: type,
      ref_id: p.id,
      name: p.name,
      sku: p[skuField],
      unit_cost: Number(p.unit_cost) || 0,
      qty: 1,
      available: Number(p.quantity_on_hand) || 0,
    }]);
    setSearch("");
  };

  const updateQty = (uid, qty) => {
    setSelected(prev => prev.map(s => s.uid === uid ? { ...s, qty: Math.max(1, Number(qty) || 1) } : s));
  };

  const removeItem = (uid) => setSelected(prev => prev.filter(s => s.uid !== uid));

  const attachPO = (po) => {
    setAttachedPOs(prev => [...prev, {
      id: po.id,
      po_number: po.po_number,
      supplier_name: po.supplier_name || "",
      total: po.total || 0,
    }]);
    // Populate line items
    const items = (po.line_items || []).map((li, idx) => ({
      uid: `po-${po.id}-${idx}-${li.part_id || idx}`,
      source: "po",
      item_type: "part",
      ref_id: li.part_id || "",
      name: li.description || li.part_number || "PO Item",
      sku: li.part_number || "",
      unit_cost: Number(li.unit_cost) || 0,
      qty: Number(li.quantity) || 1,
      available: null,
      po_id: po.id,
      po_number: po.po_number,
    }));
    setSelected(prev => [...prev, ...items]);
    setPoSearch("");
  };

  const detachPO = (poId) => {
    setAttachedPOs(prev => prev.filter(p => p.id !== poId));
    setSelected(prev => prev.filter(s => s.po_id !== poId));
  };

  const handleSubmit = async () => {
    if (selected.length === 0 && laborCost <= 0) {
      toast.error("Add at least one part, core, PO, or labor entry");
      return;
    }
    // Validate stock for inventory-sourced items only
    const overAllocated = selected.find(s => s.source === "inventory" && s.qty > s.available);
    if (overAllocated) {
      toast.error(`Only ${overAllocated.available} of ${overAllocated.name} in stock`);
      return;
    }
    setSaving(true);
    try {
      // 1. Deduct inventory for inventory-sourced items (parts + cores)
      for (const s of selected.filter(x => x.source === "inventory")) {
        if (s.item_type === "part") {
          const p = parts.find(pp => pp.id === s.ref_id);
          if (!p) continue;
          const newQty = Math.max(0, (Number(p.quantity_on_hand) || 0) - s.qty);
          await base44.entities.Part.update(s.ref_id, { quantity_on_hand: newQty });
        } else {
          const c = cores.find(cc => cc.id === s.ref_id);
          if (!c) continue;
          const newQty = Math.max(0, (Number(c.quantity_on_hand) || 0) - s.qty);
          await base44.entities.EngineCore.update(s.ref_id, { quantity_on_hand: newQty });
        }
      }

      // 2. Build expense description
      const invItems = selected.filter(s => s.source === "inventory");
      const poItems = selected.filter(s => s.source === "po");
      const invLine = invItems.length > 0
        ? `Inventory used: ${invItems.map(s => `${s.name} x${s.qty} @ $${s.unit_cost.toFixed(2)} = $${(s.unit_cost * s.qty).toFixed(2)}`).join("; ")}`
        : "";
      const poLine = attachedPOs.length > 0
        ? `POs attached: ${attachedPOs.map(p => p.po_number).join(", ")}`
        : "";
      const poItemsLine = poItems.length > 0
        ? `PO items: ${poItems.map(s => `${s.name} x${s.qty} @ $${s.unit_cost.toFixed(2)} = $${(s.unit_cost * s.qty).toFixed(2)}`).join("; ")}`
        : "";
      const laborLine = laborCost > 0
        ? `Labor: ${laborHours}h @ $${laborRate}/h = $${laborCost.toFixed(2)}`
        : "";
      const fullDesc = `Warranty repair: ${build.engine_serial_number}${build.eed_id ? ` (${build.eed_id})` : ""} — ${description || "Warranty work"}${invLine ? `\n${invLine}` : ""}${poLine ? `\n${poLine}` : ""}${poItemsLine ? `\n${poItemsLine}` : ""}${laborLine ? `\n${laborLine}` : ""}`;

      // 3. Create the warranty repair Expense (debit) to track the loss
      const expense = await base44.entities.Expense.create({
        expense_number: `WARR-${Date.now().toString().slice(-6)}`,
        category: "warranty_repair",
        description: fullDesc,
        amount: total,
        date: new Date().toISOString().split("T")[0],
        build_id: build.id,
        source: "warranty",
        notes: `Auto-created from warranty build completion. ${description || ""}`.trim(),
      });

      // 4. Record the repair cost + expense link on the build
      await base44.entities.EngineBuild.update(build.id, {
        warranty_repair_cost: total,
        warranty_expense_id: expense.id,
      });

      const invCount = invItems.length;
      const poCount = attachedPOs.length;
      toast.success(`Warranty repair recorded — $${total.toFixed(2)} expensed${invCount ? `, ${invCount} item(s) removed from inventory` : ""}${poCount ? `, ${poCount} PO(s) attached` : ""}`);
      onConfirm(total);
    } catch (e) {
      toast.error("Failed to record warranty cost: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            Complete Warranty Work
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-500">
            Browse your inventory (parts &amp; cores), attach POs to auto-populate their items, and add labor. Inventory items are deducted from stock; PO items are expensed at cost. The total is recorded as a warranty expense.
          </p>
          <div className="bg-purple-50 rounded-lg p-3 text-sm">
            <p className="font-semibold text-purple-800">{build?.engine_serial_number} {build?.eed_id && <span className="font-mono">({build.eed_id})</span>}</p>
            {build?.warranty_reason && (
              <p className="text-xs text-purple-600 mt-1">{build.warranty_reason}</p>
            )}
          </div>

          {/* Inventory browser */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Package className="w-4 h-4 text-slate-500" />
                Browse Inventory
              </Label>
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                <button
                  onClick={() => setBrowseType("part")}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${browseType === "part" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
                >
                  Parts
                </button>
                <button
                  onClick={() => setBrowseType("core")}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${browseType === "core" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
                >
                  Cores
                </button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${browseType === "part" ? "parts" : "cores"} by name or ${browseType === "part" ? "part number" : "core number"}...`}
                className="pl-9"
              />
              {inventoryResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {loading && <p className="p-2 text-xs text-slate-400">Loading inventory...</p>}
                  {inventoryResults.map(p => {
                    const sku = browseType === "part" ? p.part_number : p.core_number;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addInventoryItem(p, browseType)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{sku}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="outline" className="text-[10px]">{p.quantity_on_hand} in stock</Badge>
                          <span className="text-sm font-semibold text-slate-700">${(Number(p.unit_cost) || 0).toFixed(2)}</span>
                          <Plus className="w-4 h-4 text-emerald-600" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* PO attachment */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <Label className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-500" />
              Attach Purchase Orders
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
                placeholder="Search POs by number or supplier..."
                className="pl-9"
              />
              {poResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {poResults.map(po => (
                    <button
                      key={po.id}
                      type="button"
                      onClick={() => attachPO(po)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium font-mono text-[#e20404]">{po.po_number}</p>
                        <p className="text-xs text-slate-400">{po.supplier_name || "—"} · {(po.line_items || []).length} items</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="text-[10px]">{po.status}</Badge>
                        <span className="text-sm font-semibold text-slate-700">${(po.total || 0).toLocaleString()}</span>
                        <Plus className="w-4 h-4 text-emerald-600" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {attachedPOs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {attachedPOs.map(po => (
                  <div key={po.id} className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-md pl-2 pr-1 py-1">
                    <span className="text-xs font-mono font-semibold text-amber-800">{po.po_number}</span>
                    <span className="text-xs text-amber-600">${(po.total || 0).toLocaleString()}</span>
                    <button onClick={() => detachPO(po.id)} className="text-amber-500 hover:text-amber-700 p-0.5">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected items */}
          {selected.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
              <Label>Items on this repair</Label>
              {selected.map(s => (
                <div key={s.uid} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <div className="flex items-center gap-1.5">
                      {s.sku && <span className="text-xs text-slate-400 font-mono">{s.sku}</span>}
                      {s.source === "inventory" ? (
                        <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px]">
                          {s.item_type === "core" ? "Core" : "Part"} · {s.available} avail
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">PO {s.po_number}</Badge>
                      )}
                    </div>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    max={s.available || undefined}
                    value={s.qty}
                    onChange={(e) => updateQty(s.uid, e.target.value)}
                    className="w-16 h-8 text-center"
                  />
                  <span className="text-sm font-semibold w-16 text-right">${(s.unit_cost * s.qty).toFixed(2)}</span>
                  <button onClick={() => removeItem(s.uid)} className="text-red-500 hover:text-red-700 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex justify-between text-sm pt-1">
                <span className="text-slate-500">Parts &amp; cores subtotal</span>
                <span className="font-semibold">${partsCost.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Labor section */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <Label>Labor</Label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs text-slate-400">Hours</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  value={laborHours}
                  onChange={(e) => setLaborHours(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Rate / hr ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={laborRate}
                  onChange={(e) => setLaborRate(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Labor cost</Label>
                <div className="h-9 flex items-center font-semibold text-slate-700 border border-slate-200 rounded-md px-3 bg-slate-50">
                  ${laborCost.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label>Repair Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was wrong and what was fixed..."
              className="min-h-[70px]"
            />
          </div>

          {/* Total */}
          <div className="flex justify-between items-center bg-purple-50 rounded-lg p-3 border border-purple-200">
            <span className="text-sm font-medium text-purple-800">Total Warranty Expense</span>
            <span className="text-xl font-bold text-purple-900">${total.toFixed(2)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700 text-white"
            onClick={handleSubmit}
            disabled={saving || (selected.length === 0 && laborCost <= 0)}
          >
            {saving ? "Recording..." : "Record & Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}