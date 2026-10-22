import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronDown, ChevronUp, Check, X, Plus, AlertTriangle, Package } from "lucide-react";
import LaborMachiningPickerModal from "@/components/estimates/LaborMachiningPickerModal";
import PartPickerModal from "@/components/estimates/PartPickerModal";
import { normalizePart, normalizeKit, normalizeCoreSale, normalizeCoreCredit } from "@/lib/normalizeLineItem";

/**
 * Full-screen mobile item editor for parts, labor, and machining line items.
 *
 * The editor OWNS its catalog picker: selecting from the catalog updates the
 * local draft only — the parent document is never mutated until "Apply
 * Changes" is pressed. Cancelling (with or without a catalog selection)
 * leaves the document unchanged.
 *
 * "Apply & Add Another" commits the current draft exactly once, then resets
 * to a fresh draft (preserving shared context like engine assignment) using
 * a skip-sync flag so the prop-driven sync effect does not clobber the reset.
 *
 * z-index is 45 — below dialog/select portals (z-50) so the catalog picker
 * and dropdowns render above the editor, but above the bottom nav (z-40).
 *
 * Labor is fixed-price: no quantity input, price labeled "Labor Charge".
 * Machining and parts support quantity.
 */

const EMPTY_PART = { part_id: "", part_number: "", item_name: "", quantity: 1, unit_cost: 0, shipping_cost: 0, unit_price: 0, total: 0 };
const EMPTY_LABOR = { name: "", description: "", price: 0 };
const EMPTY_MACHINING = { name: "", description: "", price: 0, quantity: 1, cost_type: "unspecified", actual_cost: null, vendor: "" };

function freshDraft(type, preserve = /** @type {Record<string, any>} */ ({})) {
  const base = type === "parts" ? { ...EMPTY_PART }
    : type === "labor" ? { ...EMPTY_LABOR }
    : { ...EMPTY_MACHINING };
  if (preserve.engine_section) return { ...base, engine_section: preserve.engine_section };
  return base;
}

export default function MobileItemEditor({
  open, onClose, type, item, idx, onApply, isCombined, canSaveAndAdd, onSaveAndAdd,
  // Catalog data (editor owns its picker):
  catalogItems = [],   // labor/machining catalog
  parts = [], kits = [], cores = [], customer = null,  // parts catalog
  onCommitKitSeparate = () => {}, onNewCore = () => {}, onEditCore = () => {},
  onDirtyChange,
}) {
  const [draft, setDraft] = useState(item || freshDraft(type));
  const [showShop, setShowShop] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showKitSeparateConfirm, setShowKitSeparateConfirm] = useState(null); // { kit } | null
  const [pickerOpen, setPickerOpen] = useState(false);
  const applyingRef = useRef(false);
  const skipSyncRef = useRef(false);
  const firstInputRef = useRef(null);
  const previousOverflow = useRef(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const isParts = type === "parts";
  const isMachining = type === "machining";
  const isLabor = type === "labor";
  const typeLabel = isParts ? "Part" : isLabor ? "Labor" : "Machining";
  const isNew = idx === null || idx === undefined;
  const title = isNew ? `Add ${typeLabel}` : `Edit ${typeLabel}`;

  // Sync draft from item prop when editor opens or item changes externally.
  // skipSyncRef prevents the prop sync from clobbering a fresh draft that
  // "Apply & Add Another" just created (where editingIdx→null can change the
  // item prop even though we already reset the draft ourselves).
  useEffect(() => {
    if (open) {
      if (skipSyncRef.current) {
        skipSyncRef.current = false;
      } else {
        setDraft(item || freshDraft(type));
        setShowShop(false);
        setDirty(false);
        setShowDiscardConfirm(false);
      }
    }
     
  }, [item, open]);

  // Reset the skip flag whenever the editor closes so the next open syncs.
  useEffect(() => {
    if (!open) skipSyncRef.current = false;
  }, [open]);

  // Notify the parent when the editor has an unapplied dirty draft, so the
  // navigation guard can protect it. Cleared when the editor closes.
  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);
  useEffect(() => {
    if (!open) onDirtyChangeRef.current?.(false);
  }, [open]);

  // Lock body scroll while editor is open; restore on close.
  useEffect(() => {
    if (!open) return;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow.current || ""; };
  }, [open]);

  // Focus the first input shortly after open (after portal renders).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { firstInputRef.current?.focus(); }, 100);
    return () => clearTimeout(t);
  }, [open]);

  // Escape handler — triggers discard check.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, dirty]);

  const set = useCallback((field, value) => {
    setDraft(d => ({ ...d, [field]: value }));
    setDirty(true);
  }, []);

  const requestClose = useCallback(() => {
    if (dirty) setShowDiscardConfirm(true);
    else onClose();
  }, [dirty, onClose]);

  const confirmDiscard = () => { setShowDiscardConfirm(false); onClose(); };

  // ---- Catalog selection → local draft (parent document untouched) ----

  const applyPartToDraft = (part) => {
    const override = customer?.parts_markup_override;
    const useOverride = override !== null && override !== undefined && override !== "";
    const price = useOverride ? (Number(part.unit_cost) || 0) * (1 + Number(override) / 100) : (Number(part.sell_price) || 0);
    // normalizePart clears kit/core flags+references from the previous draft so
    // replacing a kit or core credit with a regular part does not leave
    // incompatible fields that would misclassify or misprocess the new item.
    setDraft(d => normalizePart(d, part, price));
    setDirty(true);
  };

  const applyLaborToDraft = (catalogItem) => {
    setDraft(d => ({
      ...d,
      name: catalogItem.name || "",
      description: catalogItem.description || "",
      price: Number(catalogItem.price) || 0,
    }));
    setDirty(true);
  };

  const applyMachiningToDraft = (catalogItem) => {
    setDraft(d => ({
      ...d,
      name: catalogItem.name || "",
      description: catalogItem.description || "",
      price: Number(catalogItem.price) || 0,
      quantity: Number(d.quantity) || 1,
      cost_type: catalogItem.cost_type || "unspecified",
      // Guard against missing vendor fields on the catalog row.
      vendor: catalogItem.cost_type === "outsourced"
        ? (catalogItem.default_vendor || d.vendor || "")
        : (d.vendor || ""),
    }));
    setDirty(true);
  };

  const applyKitToDraft = (kit) => {
    const partsCost = (kit.components || []).reduce((s, c) => s + (Number(c.unit_cost) || 0) * (Number(c.quantity) || 1), 0);
    const partsPrice = (kit.components || []).reduce((s, c) => s + (Number(c.unit_price) || 0) * (Number(c.quantity) || 1), 0);
    const laborPrice = (kit.labor_items || []).reduce((s, l) => s + (Number(l.price) || 0), 0);
    const hasCostOv = kit.kit_cost_override != null && !isNaN(Number(kit.kit_cost_override));
    const hasPriceOv = kit.kit_price_override != null && !isNaN(Number(kit.kit_price_override));
    const kitCost = hasCostOv ? Number(kit.kit_cost_override) : partsCost;
    const kitPrice = hasPriceOv ? Number(kit.kit_price_override) : (partsPrice + laborPrice);
    // normalizeKit clears core flags/references from the previous draft so
    // replacing a core credit with a kit does not leave is_core_credit/core_id.
    setDraft(d => normalizeKit(d, kit, kitCost, kitPrice));
    setDirty(true);
  };

  const applyCoreToDraft = (core, mode) => {
    // normalizeCoreSale / normalizeCoreCredit clear kit flags/references from
    // the previous draft so replacing a kit with a core does not leave
    // is_kit/kit_id/kit_components on the new core line.
    if (mode === "credit") {
      setDraft(d => normalizeCoreCredit(d, core));
    } else {
      setDraft(d => normalizeCoreSale(d, core));
    }
    setDirty(true);
  };

  const handleSearchCatalog = () => setPickerOpen(true);

  if (!open) return null;

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
  const priceLabel = isLabor ? "Labor Charge" : "Unit Price";

  // Apply Changes — commit the draft exactly once, then close.
  const handleApply = () => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    onApply(idx, draft);
    applyingRef.current = false;
    onClose();
  };

  // Apply & Add Another — commit the current draft exactly once, then reset to
  // a fresh draft (preserving shared context like engine assignment). The
  // editor stays open. skipSyncRef prevents the prop-sync effect from
  // overwriting this fresh draft when the parent switches editingIdx→null.
  const handleApplyAndAdd = () => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    if (onSaveAndAdd) onSaveAndAdd(idx, draft);
    else onApply(idx, draft);
    applyingRef.current = false;
    skipSyncRef.current = true;
    setDraft(freshDraft(type, { engine_section: draft.engine_section }));
    setDirty(false);
    setShowShop(false);
    setShowDiscardConfirm(false);
    setTimeout(() => firstInputRef.current?.focus(), 50);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[45] bg-white flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Header with top safe area */}
      <div className="flex items-center justify-between px-4 border-b border-slate-200 bg-white shrink-0"
           style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)", paddingBottom: "0.75rem" }}>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <button onClick={requestClose} className="h-11 w-11 flex items-center justify-center -mr-2 text-slate-500 hover:text-slate-900" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ paddingBottom: "2rem" }}>
        {/* Catalog search — opens the editor's own picker (draft only) */}
        <Button variant="outline" className="w-full h-12 text-base" onClick={handleSearchCatalog}>
          <Search className="w-4 h-4 mr-2" /> Search Catalog
        </Button>

        {/* Name */}
        <div>
          <Label className="text-sm font-medium">{isParts ? "Item Name" : "Name"} *</Label>
          <Input
            ref={firstInputRef}
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
              placeholder="Customer-facing description..."
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

        {/* Quantity + Price — labor is fixed-price, no quantity */}
        {isLabor ? (
          <div>
            <Label className="text-sm font-medium">{priceLabel}</Label>
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
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Quantity</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={draft.quantity ?? 1}
                onChange={e => set("quantity", isMachining ? (Number(e.target.value) || 1) : Number(e.target.value))}
                className="mt-1 h-12 text-base text-center"
                min={isMachining ? "1" : "0"}
                step={isMachining ? "1" : "0.01"}
              />
            </div>
            <div>
              <Label className="text-sm font-medium">{priceLabel}</Label>
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
        )}

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
              aria-expanded={showShop}
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
      <div className="border-t border-slate-200 bg-white px-4 flex gap-2 shrink-0"
           style={{ paddingTop: "0.75rem", paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}>
        <Button variant="outline" className="flex-1 h-12 text-base" onClick={requestClose}>Cancel</Button>
        {canSaveAndAdd && (
          <Button variant="outline" className="flex-1 h-12 text-base border-[#e20404] text-[#e20404]" onClick={handleApplyAndAdd} disabled={applyingRef.current}>
            <Plus className="w-4 h-4 mr-1" /> Apply & Add
          </Button>
        )}
        <Button className="flex-1 h-12 text-base bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleApply} disabled={applyingRef.current}>
          <Check className="w-4 h-4 mr-1" /> Apply Changes
        </Button>
      </div>

      {/* Catalog picker — editor-owned; selection updates the draft only */}
      {isParts ? (
        <PartPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          parts={parts}
          kits={kits}
          cores={cores}
          onSelect={(part) => applyPartToDraft(part)}
          onSelectKit={(kit, mode) => {
            if (mode === "whole") {
              applyKitToDraft(kit);
              setPickerOpen(false);
            } else if (onCommitKitSeparate) {
              // Kit-separate expands into multiple lines and cannot fit a single
              // draft. Show an explicit confirmation before committing — never
              // silently commit while the operator has an unconfirmed draft.
              setPickerOpen(false);
              setShowKitSeparateConfirm(kit);
            }
          }}
          onSelectCore={(core, mode) => { applyCoreToDraft(core, mode); setPickerOpen(false); }}
          onNewCore={onNewCore}
          onEditCore={onEditCore}
        />
      ) : (
        <LaborMachiningPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          items={catalogItems}
          type={type}
          onSelect={(catalogItem) => isLabor ? applyLaborToDraft(catalogItem) : applyMachiningToDraft(catalogItem)}
        />
      )}

      {/* Discard confirmation */}
      {showDiscardConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 px-6">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Discard changes?</h3>
                <p className="text-sm text-slate-500 mt-1">Your edits to this {typeLabel.toLowerCase()} will be lost.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setShowDiscardConfirm(false)}>Keep Editing</Button>
              <Button variant="destructive" className="flex-1 h-11" onClick={confirmDiscard}>Discard</Button>
            </div>
          </div>
        </div>
      )}

      {/* Kit-separate confirmation — expanding a kit into multiple lines */}
      {showKitSeparateConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 px-6">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Add kit as separate parts?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  "{showKitSeparateConfirm.name}" will be expanded into {(showKitSeparateConfirm.components || []).length} separate line items on the document. The editor will close.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setShowKitSeparateConfirm(null)}>Cancel</Button>
              <Button className="flex-1 h-11 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => {
                const kit = showKitSeparateConfirm;
                setShowKitSeparateConfirm(null);
                onClose();
                onCommitKitSeparate(kit);
              }}>Add Parts</Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}