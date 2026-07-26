import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileImage, FileText, Star, Eye } from "lucide-react";
import DynoSheetUploader from "./DynoSheetUploader";

export default function BuildDynoSheets({ buildId }) {
  const qc = useQueryClient();
  const [view, setView] = useState(null);

  const { data: sheets = [], isLoading } = useQuery({
    queryKey: ["build-dyno-sheets", buildId],
    queryFn: () => base44.entities.DynoSheet.filter({ build_id: buildId }, "-created_date", 200),
    enabled: !!buildId,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["build-dyno-sheets", buildId] });

  const isPdf = (s) => s.file_type === "pdf" || (s.filename || "").toLowerCase().endsWith(".pdf");

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Dyno Sheets</CardTitle>
          <DynoSheetUploader buildId={buildId} role="admin" onUploaded={refresh} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : sheets.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <FileImage className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No dyno sheets uploaded yet. Upload the latest run to share with the customer.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">History is preserved — only the most recent sheet is marked current and shown to the customer.</p>
            {sheets.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border border-slate-200 rounded-lg p-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isPdf(s) ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"}`}>
                  {isPdf(s) ? <FileText className="w-4 h-4" /> : <FileImage className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800 truncate">{s.filename || "dyno-sheet"}</span>
                    {s.is_current && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">
                        <Star className="w-3 h-3 mr-0.5" />Current
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {s.created_date ? new Date(s.created_date).toLocaleString() : ""}
                    {" · by "}{s.uploaded_by || (s.uploaded_by_role === "customer" ? "Customer" : "Shop")}
                  </p>
                  {s.notes && <p className="text-xs text-slate-500 mt-0.5">{s.notes}</p>}
                </div>
                <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => setView(s)}>
                  <Eye className="w-3.5 h-3.5 mr-1" />View
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-base">{view?.filename || "Dyno sheet"}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh]">
            {view && (isPdf(view) ? (
              <iframe src={view.file_url} title={view.filename || "dyno"} className="w-full h-[70vh] border border-slate-200 rounded-lg" />
            ) : (
              <img src={view.file_url} alt={view.filename || "dyno"} className="w-full rounded-lg" />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}