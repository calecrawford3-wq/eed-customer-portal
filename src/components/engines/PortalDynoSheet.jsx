import React from "react";
import { Button } from "@/components/ui/button";
import { FileImage, FileText, Download } from "lucide-react";
import DynoSheetUploader from "./DynoSheetUploader";

export default function PortalDynoSheet({ buildId, currentSheet, onUploaded }) {
  const isPdf = (s) => s && (s.file_type === "pdf" || (s.filename || "").toLowerCase().endsWith(".pdf"));

  if (!currentSheet) {
    return (
      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dyno Sheet</p>
            <p className="text-xs text-slate-400 mt-0.5">No dyno sheet on file yet. Upload yours below.</p>
          </div>
          <DynoSheetUploader buildId={buildId} role="customer" onUploaded={onUploaded} />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isPdf(currentSheet) ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"}`}>
            {isPdf(currentSheet) ? <FileText className="w-4 h-4" /> : <FileImage className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dyno Sheet (most recent)</p>
            <p className="text-sm font-medium text-slate-800 truncate">{currentSheet.filename || "dyno-sheet"}</p>
            <p className="text-xs text-slate-400">
              {currentSheet.created_date ? new Date(currentSheet.created_date).toLocaleDateString() : ""}
              {" · uploaded by "}{currentSheet.uploaded_by || (currentSheet.uploaded_by_role === "customer" ? "you" : "EED")}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <a href={currentSheet.file_url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline"><Download className="w-3.5 h-3.5 mr-1" />View</Button>
          </a>
          <DynoSheetUploader buildId={buildId} role="customer" onUploaded={onUploaded} />
        </div>
      </div>
    </div>
  );
}