import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitCompare, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function RevisionCompareModal({ open, onClose, revisionA, revisionB, labelA = "Baseline (actual)", labelB = "Proposed (simulated)" }) {
  const { data: revA } = useQuery({
    queryKey: ["rev", revisionA],
    queryFn: () => base44.entities.BuildRevision.filter({ id: revisionA }).then((r) => r[0]),
    enabled: !!revisionA,
  });
  const { data: revB } = useQuery({
    queryKey: ["rev", revisionB],
    queryFn: () => base44.entities.BuildRevision.filter({ id: revisionB }).then((r) => r[0]),
    enabled: !!revisionB,
  });

  const diffs = useMemo(() => {
    if (!revA?.config || !revB?.config) return [];
    const out = [];
    const walk = (a, b, path) => {
      const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
      for (const k of keys) {
        const p = path ? `${path}.${k}` : k;
        const av = a?.[k], bv = b?.[k];
        if (av && typeof av === "object" && !Array.isArray(av)) walk(av, bv, p);
        else if (JSON.stringify(av) !== JSON.stringify(bv) && (bv !== null && bv !== "" && bv !== undefined)) {
          out.push({ field: p, from: av ?? "—", to: bv });
        }
      }
    };
    walk(revA.config, revB.config, "");
    return out;
  }, [revA, revB]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><GitCompare className="w-5 h-5 text-[#e20404]" /> Revision Comparison</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <Badge variant="outline" className="text-[11px]">{labelA}: {revA?.revision_name || "…"}</Badge>
          <Badge className="bg-[#e20404] text-white border-0 text-[11px]">{labelB}: {revB?.revision_name || "…"}</Badge>
        </div>
        {diffs.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No differences — proposed matches the baseline.</p>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr><th className="text-left px-3 py-2">Field</th><th className="text-left px-3 py-2">Baseline</th><th className="text-left px-3 py-2">Proposed</th></tr>
              </thead>
              <tbody>
                {diffs.map((d, i) => (
                  <tr key={i} className={i % 2 ? "bg-slate-50/40" : ""}>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{d.field}</td>
                    <td className="px-3 py-1.5 text-slate-500">{String(d.from)}</td>
                    <td className="px-3 py-1.5 font-medium text-[#e20404]">{String(d.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-xs text-slate-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>The actual build record is never modified. The proposed revision only becomes a real build after explicit approval.</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}