import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Wrench, Cog } from "lucide-react";
import MobileItemEditor from "./MobileItemEditor";

const emptyLabor = { name: "", description: "", price: 0 };
const emptyMachining = { name: "", description: "", price: 0, quantity: 1, cost_type: "unspecified", actual_cost: null, vendor: "" };

/**
 * Mobile replacement for SimpleItemsTable.  Renders stacked cards with a
 * full-screen editor.  All mutations go through onReplaceItem / onRemove /
 * onAdd / onPick which call the parent's existing recalc logic.
 */
export default function MobileLaborMachiningSection({ type, items, isCombined, onReplaceItem, onRemove, onAdd, onPick }) {
  const [editingIdx, setEditingIdx] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const isLabor = type === "labor";
  const isMachining = type === "machining";
  const Icon = isLabor ? Wrench : Cog;
  const nameLabel = isLabor ? "Labor" : "Machining";
  const emptyItem = isLabor ? emptyLabor : emptyMachining;

  const openEditor = (idx) => { setEditingIdx(idx); setEditorOpen(true); };
  const closeEditor = () => { setEditorOpen(false); setEditingIdx(null); };

  const handleApply = (idx, draft) => { onReplaceItem(idx, draft); };

  const handleSaveAndAdd = (idx, draft) => {
    handleApply(idx, draft);
    onAdd();
    setEditingIdx(items.length);
    // editor stays open — item prop changes to the new blank item, useEffect resets draft
  };

  const handleAdd = () => {
    onAdd();
    setEditingIdx(items.length);
    setEditorOpen(true);
  };

  return (
    <Card className="border-0 shadow-sm mb-6">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4" /> {nameLabel}</CardTitle>
        <Button size="sm" variant="outline" className="h-9" onClick={handleAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {(items || []).length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">No {nameLabel.toLowerCase()} items added.</p>
        ) : (
          (items || []).map((item, idx) => (
            <LaborMachiningCard key={idx} item={item} type={type} isCombined={isCombined} onEdit={() => openEditor(idx)} onRemove={() => onRemove(idx)} />
          ))
        )}
      </CardContent>

      <MobileItemEditor
        open={editorOpen}
        onClose={closeEditor}
        type={type}
        item={editingIdx !== null ? (items[editingIdx] || emptyItem) : emptyItem}
        idx={editingIdx}
        onApply={handleApply}
        onPick={(idx) => onPick(idx)}
        isCombined={isCombined}
        canSaveAndAdd
        onSaveAndAdd={handleSaveAndAdd}
      />
    </Card>
  );
}

function LaborMachiningCard({ item, type, isCombined, onEdit, onRemove }) {
  const [showShop, setShowShop] = useState(false);
  const isMachining = type === "machining";
  const price = Number(item.price) || 0;
  const qty = isMachining ? (Number(item.quantity) || 1) : 1;
  const total = price * qty;

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 break-words">{item.name || <span className="text-slate-400 italic">Untitled</span>}</p>
          {item.description && <p className="text-sm text-slate-500 break-words mt-0.5">{item.description}</p>}
          {isCombined && item.engine_section && <p className="text-xs text-[#e20404] mt-0.5 break-words">{item.engine_section}</p>}
        </div>
        <p className="text-lg font-bold text-slate-900 shrink-0">${total.toFixed(2)}</p>
      </div>

      {isMachining && qty > 1 && (
        <p className="text-sm text-slate-600 mt-1">{qty} × ${price.toFixed(2)}</p>
      )}

      {/* Shop details for machining (expandable, staff only) */}
      {isMachining && (
        <div className="mt-2">
          <button className="text-xs text-slate-500 flex items-center gap-1" onClick={() => setShowShop(s => !s)}>
            {showShop ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Shop Details
          </button>
          {showShop && (
            <div className="mt-1 text-xs text-slate-500 space-y-0.5">
              <p>Cost Type: <span className="font-medium capitalize">{(item.cost_type || "unspecified").replace("_", " ")}</span></p>
              {item.cost_type === "outsourced" && (
                <>
                  {item.vendor && <p>Vendor: {item.vendor}</p>}
                  <p>Actual Cost: {item.actual_cost != null ? `$${Number(item.actual_cost).toFixed(2)}` : "—"}</p>
                </>
              )}
              {item.cost_type === "in_house" && <p className="text-blue-600 italic">Covered by logged labor hours</p>}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="outline" className="flex-1 h-11" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
        </Button>
        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 h-11 w-11 p-0" onClick={onRemove}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}