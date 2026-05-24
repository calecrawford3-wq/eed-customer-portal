import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Package, ChevronRight } from "lucide-react";

/**
 * CannedJobPicker - select a spec sheet and prefill estimate with its parts/labor template.
 * Props:
 *   open, onClose, specSheets, platforms, parts
 *   onSelect(specSheet, platform) — called with the chosen spec sheet
 */
export default function CannedJobPicker({ open, onClose, specSheets, platforms, parts, onSelect }) {
  const [filterPlatform, setFilterPlatform] = useState("all");

  const activeSpecs = specSheets.filter(s => s.status === "active" || s.status === "draft");
  const filtered = filterPlatform === "all"
    ? activeSpecs
    : activeSpecs.filter(s => s.platform_id === filterPlatform);

  const getSpecTypeLabel = (t) => ({
    stock: "Stock", stage_1: "Stage 1", stage_2: "Stage 2",
    stage_3: "Stage 3", contract: "Contract", custom: "Custom"
  }[t] || t);

  const getPlatform = (id) => platforms.find(p => p.id === id);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-purple-600" /> Select Engine Build Spec (Canned Job)
          </DialogTitle>
        </DialogHeader>

        <div className="mb-4">
          <Select value={filterPlatform} onValueChange={setFilterPlatform}>
            <SelectTrigger><SelectValue placeholder="Filter by platform" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              {platforms.map(p => <SelectItem key={p.id} value={p.id}>{p.manufacturer} {p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No active spec sheets found. Create spec sheets first.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(spec => {
              const platform = getPlatform(spec.platform_id);
              return (
                <div key={spec.id} className="border border-slate-200 rounded-lg p-4 hover:border-purple-300 hover:bg-purple-50/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-900">
                          {spec.custom_name || getSpecTypeLabel(spec.spec_type)}
                        </p>
                        <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">v{spec.version}</Badge>
                        <Badge className={`border-0 text-xs ${spec.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {spec.status}
                        </Badge>
                      </div>
                      {platform && (
                        <p className="text-sm text-slate-500">{platform.manufacturer} {platform.name} · {platform.displacement_cc}cc</p>
                      )}
                      {spec.notes && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{spec.notes}</p>}
                      <div className="flex gap-3 mt-2 text-xs text-slate-500">
                        {spec.specs?.rotating_assembly?.stroke_mm && <span>Stroke: {spec.specs.rotating_assembly.stroke_mm}mm</span>}
                        {spec.specs?.block?.bore_diameter_mm && <span>Bore: {spec.specs.block.bore_diameter_mm}mm</span>}
                        {spec.specs?.valvetrain?.lash_intake_mm && <span>Lash In: {spec.specs.valvetrain.lash_intake_mm}</span>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-white ml-3 shrink-0"
                      onClick={() => { onSelect(spec, platform); onClose(); }}
                    >
                      Use <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}