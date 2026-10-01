import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitCompare, ArrowRight, Plus, Minus, Equal } from "lucide-react";

/**
 * VersionDiffModal — compares two canned job versions side by side.
 * Shows added, removed, and unchanged parts/labor/machining items.
 */
export default function VersionDiffModal({ open, onClose, oldVersion, newVersion }) {
  if (!oldVersion || !newVersion) return null;

  const oldParts = new Map((oldVersion.line_items || []).map(i => [i.part_id || i.item_name, i]));
  const newParts = new Map((newVersion.line_items || []).map(i => [i.part_id || i.item_name, i]));
  const oldLabor = new Map((oldVersion.labor_items || []).map(i => [i.name, i]));
  const newLabor = new Map((newVersion.labor_items || []).map(i => [i.name, i]));
  const oldMachining = new Map((oldVersion.machining_items || []).map(i => [i.name, i]));
  const newMachining = new Map((newVersion.machining_items || []).map(i => [i.name, i]));

  const allPartKeys = new Set([...oldParts.keys(), ...newParts.keys()]);
  const allLaborKeys = new Set([...oldLabor.keys(), ...newLabor.keys()]);
  const allMachiningKeys = new Set([...oldMachining.keys(), ...newMachining.keys()]);

  const Row = ({ label, oldQty, newQty, type }) => {
    const oldN = Number(oldQty) || 0;
    const newN = Number(newQty) || 0;
    const diff = newN - oldN;
    const isAdded = oldN === 0 && newN > 0;
    const isRemoved = oldN > 0 && newN === 0;
    const isChanged = !isAdded && !isRemoved && diff !== 0;
    return (
      <div className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${
        isAdded ? "bg-emerald-50" : isRemoved ? "bg-red-50" : isChanged ? "bg-amber-50" : ""
      }`}>
        {isAdded && <Plus className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
        {isRemoved && <Minus className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />}
        {isChanged && <ArrowRight className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />}
        {!isAdded && !isRemoved && !isChanged && <Equal className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />}
        <span className="flex-1 truncate">{label}</span>
        <span className="text-slate-400 text-xs">{oldN}</span>
        <ArrowRight className="w-3 h-3 text-slate-300" />
        <span className="font-medium text-xs">{newN}</span>
        {isChanged && <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">{diff > 0 ? `+${diff}` : diff}</Badge>}
      </div>
    );
  };

  const SectionTitle = ({ title, count }) => (
    <div className="flex items-center gap-2 mt-3 mb-1">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
      <span className="text-xs text-slate-400">({count})</span>
    </div>
  );

  const partCount = [...allPartKeys].filter(k => {
    const o = oldParts.get(k)?.quantity || 0;
    const n = newParts.get(k)?.quantity || 0;
    return o !== n;
  }).length;
  const laborCount = [...allLaborKeys].filter(k => !oldLabor.has(k) || !newLabor.has(k)).length;
  const machiningCount = [...allMachiningKeys].filter(k => !oldMachining.has(k) || !newMachining.has(k)).length;
  const totalChanges = partCount + laborCount + machiningCount;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-purple-600" /> Version Comparison
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-center gap-4 mb-2">
          <div className="text-center">
            <Badge className="bg-slate-200 text-slate-600 border-0">v{oldVersion.version || 1}</Badge>
            <p className="text-xs text-slate-500 mt-1">{oldVersion.name}</p>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-400" />
          <div className="text-center">
            <Badge className="bg-purple-100 text-purple-700 border-0">v{newVersion.version || 1}</Badge>
            <p className="text-xs text-slate-500 mt-1">{newVersion.name}</p>
          </div>
        </div>

        {newVersion.version_notes && (
          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 mb-2">
            <span className="font-medium">Change notes: </span>{newVersion.version_notes}
          </div>
        )}

        {totalChanges === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Equal className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No differences between these versions</p>
          </div>
        ) : (
          <>
            <SectionTitle title="Parts" count={partCount} />
            <div className="space-y-0.5">
              {[...allPartKeys].map(key => {
                const old = oldParts.get(key);
                const nw = newParts.get(key);
                if ((old?.quantity || 0) === (nw?.quantity || 0)) return null;
                return <Row key={key} label={nw?.item_name || old?.item_name || key} oldQty={old?.quantity} newQty={nw?.quantity} />;
              })}
            </div>

            <SectionTitle title="Labor" count={laborCount} />
            <div className="space-y-0.5">
              {[...allLaborKeys].map(key => {
                const old = oldLabor.get(key);
                const nw = newLabor.get(key);
                if (old && nw) return null;
                return (
                  <div key={key} className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${!old ? "bg-emerald-50" : "bg-red-50"}`}>
                    {!old ? <Plus className="w-3.5 h-3.5 text-emerald-600" /> : <Minus className="w-3.5 h-3.5 text-red-600" />}
                    <span className="flex-1">{key}</span>
                  </div>
                );
              })}
            </div>

            <SectionTitle title="Machining" count={machiningCount} />
            <div className="space-y-0.5">
              {[...allMachiningKeys].map(key => {
                const old = oldMachining.get(key);
                const nw = newMachining.get(key);
                if (old && nw) return null;
                return (
                  <div key={key} className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${!old ? "bg-emerald-50" : "bg-red-50"}`}>
                    {!old ? <Plus className="w-3.5 h-3.5 text-emerald-600" /> : <Minus className="w-3.5 h-3.5 text-red-600" />}
                    <span className="flex-1">{key}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}