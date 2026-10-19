import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronDown, ChevronUp, Save, X, Plus } from "lucide-react";

/**
 * Full-screen mobile item editor for parts, labor, and machining line items.
 * Maintains a local draft; calls onApply to push to the form (which runs the
 * same recalc as desktop), then onClose to dismiss.  Catalog search applies
 * the draft first so the picker updates the correct line, then the editor
 * re-syncs from the updated item prop.
 */
export default function MobileItemEditor({ open, onClose, type, item, idx, onApply, onPick, isCombined, canSaveAndAdd, onSaveAndAdd }) {
  const [draft, setDraft] = useState(item || {});
  const [showShop, setShowShop] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(item || {});
      setShowShop(false);
    }
  }, [item, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const set = useCallback((field, value) => setDraft(d => ({ ...d, [field]: value })), []);

  if (!open) return null;

  const isParts = type === "parts";
  const isMachining = type === "machining";
  const typeLabel = isParts ? "Part" : type === "labor" ? "Labor" : "Machining";
  const title = `Edit ${typeLabel}`;

  const lineTotal = isParts
    ? (Number(draft.quantity) || 0) * (Number(draft.unit_price) || 0)
    : isMachining
      ? (Number(draft.price) || 0) * (Number(draft.quantity) || 1)
      : Number(draft.price) || 0;

  const margin = isParts && Number(draft.unit_price) > 0
    ? ((Number(draft.unit_price) - (Number(draft.unit_cost) || 0) - (Number(draft.shipping_cost) || 0)) / Number(draft.unit_price)) * 100
    : 0;

  const nameValue = isParts ? draft.item_name : draft.name;
  const nameField = isParts ? "item_name" : "name";
  const priceValue = isParts ? draft.unit_price : draft.price;
  const priceField = isParts ? "unit_price" : "price";

  const handleSave = () => { onApply(idx, draft); onClose(); };
  const handleSearchCatalog = () => { onApply(idx, draft); onPick(idx); };
  const handleSaveAndAdd = () => { if (onSaveAndAdd) { onSaveAndAdd(idx, draft); } else { onApply(idx, draft); onClose(); } };

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">
      {/* Header with top safe area */}
      <div className="flex items-center justify-between px-4 border-b border-slate-200 bg-white"
           style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)", paddingBottom: "0.75rem" }}>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <button onClick={onClose} className="h-11 w-11 flex items-center justify-center -mr-2 text-slate-500 hover:text-slate-900">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Catalog search */}
        <Button variant="outline" className="w-full h-12 text-base" onClick={handleSearchCatalog}>
          <Search className="w-4 h-4 mr-2" /> Search Catalog
        </Button>

        {/* Name */}
        <div>
          <Label className="text-sm font-medium">{isParts ? "Item Name" : "Name"} *</Label>
          <Input
            value={nameValue || ""}
            onChange={e => set(nameField, e.target.value)}
            placeholder={isParts ? "Item name..." : "Name..."}
            className="mt-1 h-12 text-base"
          />
        </div>

        {/* Part number (parts only) */}
        {isParts && (
          <div>
            <Label className="text-sm font-medium">Part Number</Label>
            <Input
              value={draft.part_number || ""}
              onChange={e => set("part_number", e.target.value)}
              placeholder="Part number..."
              className="mt-1 h-12 text-base font-mono"
            />
          </div>
        )}

        {/* Description (labor / machining) */}
        {!isParts && (
          <div>
            <Label className="text-sm font-medium">Description</Label>
            <Textarea
              value={draft.description || ""}
              onChange={e => set("description", e.target.value)}
              placeholder="Description..."
              rows={3}
              className="mt-1 text-base"
            />
          </div>
        )}

        {/* Engine section (combined invoices) */}
        {isCombined && (
          <div>
            <Label className="text-sm font-medium">Engine Section</Label>
            <Input
              value={draft.engine_section || ""}
              onChange={e => set("engine_section", e.target.value)}
              placeholder="e.g. EED 1040 — GSX600"
              className="mt-1 h-12 text-base"
            />
          </div>
        )}

        {/* Quantity + Price */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium">Quantity</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={isParts ? (draft.quantity ?? 1) : (draft.quantity ?? 1)}
              onChange={e => set("quantity", isMachining ? (Number(e.target.value) || 1) : Number(e.target.value))}
              className="mt-1 h-12 text-base text-center"
              min={isMachining ? "1" : "0"}
              step={isMachining ? "1" : "0.01"}
            />
          </div>
          <div>
            <Label className="text-sm font-medium">{isParts ? "Unit Price" : "Price"}</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <Input
                type="number"
                inputMode="decimal"
                value={priceValue ?? 0}
                onChange={e => set(priceField, Number(e.target.value))}
                className="h-12 text-base text-right pl-7"
                min="0"
                step="0.01"
              />
            </div>
          </div>
        </div>

        {/* Line total */}
        <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-slate-600">Line Total</span>
          <span className="text-xl font-bold text-slate-900">${lineTotal.toFixed(2)}</span>
        </div>

        {/* Badges */}
        {isParts && draft.is_kit && (
          <div className="flex items-center gap-2">
            <Badge className="bg-purple-100 text-purple-700 border-0">Kit</Badge>
            <span className="text-xs text-slate-500">{(draft.kit_components || []).length} components · PO expands</span>
          </div>
        )}
        {isParts && draft.is_core_credit && (
          <Badge className="bg-emerald-100 text-emerald-700 border-0">Core Credit</Badge>
        )}

        {/* Shop Details (staff only — expandable) */}
        {(isParts || isMachining) && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-3 bg-slate-50 text-sm font-medium text-slate-700"
              onClick={() => setShowShop(s => !s)}
            >
              <span>Shop Details {isParts ? "(Cost & Margin)" : "(Cost Type & Vendor)"}</span>
              {showShop ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showShop && (
              <div className="p-3 space-y-3">
                {isParts && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-slate-500">Unit Cost</Label>
                        <div className="relative mt-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                          <Input type="number" inputMode="decimal" value={draft.unit_cost || 0} onChange={e => set("unit_cost", Number(e.target.value))} className="h-10 text-base text-right pl-7" min="0" step="0.01" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Shipping / Unit</Label>
                        <div className="relative mt-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                          <Input type="number" inputMode="decimal" value={draft.shipping_cost || 0} onChange={e => set("shipping_cost", Number(e.target.value))} className="h-10 text-base text-right pl-7" min="0" step="0.01" />
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded px-3 py-2 flex justify-between text-sm">
                      <span className="text-slate-500">Margin</span>
                      <span className={margin >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>{margin.toFixed(1)}%</span>
                    </div>
                  </>
                )}
                {isMachining && (
                  <>
                    <div>
                      <Label className="text-xs text-slate-500">Cost Type</Label>
                      <Select value={draft.cost_type || "unspecified"} onValueChange={v => set("cost_type", v)}>
                        <SelectTrigger className="mt-1 h-10 text-base"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unspecified">Unspecified</SelectItem>
                          <SelectItem value="in_house">In-house</SelectItem>
                          <SelectItem value="outsourced">Outsourced</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {draft.cost_type === "outsourced" && (
                      <>
                        <div>
                          <Label className="text-xs text-slate-500">Vendor Name</Label>
                          <Input value={draft.vendor || ""} onChange={e => set("vendor", e.target.value)} placeholder="Vendor name..." className="mt-1 h-10 text-base" />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500">Actual Vendor Cost</Label>
                          <div className="relative mt-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                            <Input type="number" inputMode="decimal" value={draft.actual_cost ?? ""} onChange={e => set("actual_cost", e.target.value === "" ? null : Number(e.target.value))} placeholder="0.00" className="h-10 text-base text-right pl-7" min="0" step="0.01" />
                          </div>
                        </div>
                      </>
                    )}
                    {draft.cost_type === "in_house" && (
                      <p className="text-xs text-blue-600 italic">In-house: cost covered by logged labor hours.</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky action bar with bottom safe area */}
      <div className="border-t border-slate-200 bg-white px-4 flex gap-2"
           style={{ paddingTop: "0.75rem", paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}>
        <Button variant="outline" className="flex-1 h-12 text-base" onClick={onClose}>Cancel</Button>
        {canSaveAndAdd && (
          <Button variant="outline" className="flex-1 h-12 text-base border-[#e20404] text-[#e20404]" onClick={handleSaveAndAdd}>
            <Plus className="w-4 h-4 mr-1" /> Save & Add
          </Button>
        )}
        <Button className="flex-1 h-12 text-base bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleSave}>
          <Save className="w-4 h-4 mr-1" /> Save
        </Button>
      </div>
    </div>,
    document.body
  );
}