import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Recycle, Package, ChevronDown, ChevronUp } from "lucide-react";
import MobileItemEditor from "./MobileItemEditor";

const emptyPart = { part_id: "", part_number: "", item_name: "", quantity: 1, unit_cost: 0, unit_price: 0, total: 0 };

/**
 * Mobile replacement for the desktop parts table.  Renders stacked cards
 * with a full-screen editor.  All mutations go through onReplaceItem /
 * onRemove / onAdd / onPick which call the parent's existing recalc logic.
 *
 * "Add" opens the editor with a local draft — no blank row is added to the
 * form until the user taps "Apply Changes".  Cancelling a new item leaves
 * the form untouched.
 */
export default function MobilePartsSection({ items, isCombined, onReplaceItem, onRemove, onAdd, onPick, onAddCoreCredit, onAddCore, onAddMultiPart }) {
  const [editingIdx, setEditingIdx] = useState(null); // null = new item draft
  const [editorOpen, setEditorOpen] = useState(false);

  const openEditor = (idx) => { setEditingIdx(idx); setEditorOpen(true); };
  const openNewEditor = () => { setEditingIdx(null); setEditorOpen(true); };
  const closeEditor = () => { setEditorOpen(false); setEditingIdx(null); };

  // idx === null means new item: append via onAdd, then replace at the new index
  const handleApply = (idx, draft) => {
    const total = (Number(draft.quantity) || 0) * (Number(draft.unit_price) || 0);
    const itemWithTotal = { ...draft, total };
    if (idx === null || idx === undefined) {
      onAdd();
      onReplaceItem(items.length, itemWithTotal);
    } else {
      onReplaceItem(idx, itemWithTotal);
    }
  };

  // Apply current, then switch to a fresh draft (editor stays open)
  const handleSaveAndAdd = (idx, draft) => {
    handleApply(idx, draft);
    setEditingIdx(null);
  };

  return (
    <Card className="border-0 shadow-sm mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Parts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add buttons */}
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white h-11" onClick={openNewEditor}>
            <Plus className="w-4 h-4 mr-1" /> Part
          </Button>
          <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 h-11" onClick={onAddCore}>
            <Recycle className="w-4 h-4 mr-1" /> Core
          </Button>
          <Button size="sm" variant="outline" className="border-emerald-400 text-emerald-700 h-11" onClick={onAddCoreCredit}>
            <Recycle className="w-4 h-4 mr-1" /> Credit
          </Button>
        </div>

        {(items || []).length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">No parts added.</p>
        ) : (
          <div className="space-y-2">
            {(items || []).map((line, idx) => (
              <PartCard key={idx} line={line} isCombined={isCombined} onEdit={() => openEditor(idx)} onRemove={() => onRemove(idx)} />
            ))}
          </div>
        )}

        <Button variant="ghost" size="sm" className="text-slate-500 hover:text-[#e20404] w-full h-10" onClick={openNewEditor}>
          <Plus className="w-4 h-4 mr-1" /> Add Manual Part
        </Button>
      </CardContent>

      <MobileItemEditor
        open={editorOpen}
        onClose={closeEditor}
        type="parts"
        item={editingIdx !== null ? (items[editingIdx] || emptyPart) : emptyPart}
        idx={editingIdx}
        onApply={handleApply}
        onPick={(idx) => onPick(idx === null ? items.length : idx)}
        isCombined={isCombined}
        canSaveAndAdd
        onSaveAndAdd={handleSaveAndAdd}
      />
    </Card>
  );
}

function PartCard({ line, isCombined, onEdit, onRemove }) {
  const [showShop, setShowShop] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const total = Number(line.total || 0);
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unit_price) || 0;
  const cost = (Number(line.unit_cost) || 0) + (Number(line.shipping_cost) || 0);
  const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
  const isCredit = line.is_core_credit || total < 0;
  const hasLongName = (line.item_name || "").length > 60;

  return (
    <div className={`border rounded-lg p-3 ${isCredit ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 break-words">
            {line.item_name || <span className="text-slate-400 italic">Untitled part</span>}
          </p>
          {hasLongName && (
            <button className="text-xs text-slate-400 mt-0.5" onClick={() => setExpanded(e => !e)}>
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
          {line.part_number && <p className="text-xs text-slate-500 font-mono mt-0.5 break-all">{line.part_number}</p>}
          {isCombined && line.engine_section && <p className="text-xs text-[#e20404] mt-0.5 break-words">{line.engine_section}</p>}
          {line.is_kit && (
            <div className="flex items-center gap-1 mt-1">
              <Badge className="bg-purple-100 text-purple-700 border-0 text-[10px]">Kit</Badge>
              <span className="text-[10px] text-slate-400">{(line.kit_components || []).length} parts</span>
            </div>
          )}
        </div>
        <p className={`text-lg font-bold shrink-0 ${isCredit ? "text-emerald-700" : "text-slate-900"}`}>
          ${total.toFixed(2)}
        </p>
      </div>

      <p className="text-sm text-slate-600 mt-1">{qty} × ${price.toFixed(2)}</p>

      {/* Shop details (expandable, staff only) */}
      <div className="mt-2">
        <button className="text-xs text-slate-500 flex items-center gap-1" onClick={() => setShowShop(s => !s)}>
          {showShop ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Shop Details
        </button>
        {showShop && (
          <div className="mt-1 text-xs text-slate-500 space-y-0.5">
            <p>Cost: ${cost.toFixed(2)}{Number(line.shipping_cost) > 0 && <span className="text-slate-400"> (incl. ${Number(line.shipping_cost).toFixed(2)} ship)</span>}</p>
            <p>Margin: <span className={margin >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>{margin.toFixed(1)}%</span></p>
          </div>
        )}
      </div>

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