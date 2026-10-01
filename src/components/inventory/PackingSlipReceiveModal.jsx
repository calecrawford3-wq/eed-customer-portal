import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, AlertTriangle, CheckCircle2, PackageCheck, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

// Compute SHA-256 hash of a file for duplicate detection
async function computeFileHash(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function PackingSlipReceiveModal({ open, onClose, po }) {
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const [step, setStep] = useState("upload"); // upload | extracting | review | receiving | done
  const [file, setFile] = useState(null);
  const [extraction, setExtraction] = useState(null);
  const [reviewItems, setReviewItems] = useState([]);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [packingSlipId, setPackingSlipId] = useState(null);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setExtraction(null);
    setReviewItems([]);
    setResults(null);
    setError(null);
    setPackingSlipId(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStep("extracting");
    setError(null);
    try {
      const hash = await computeFileHash(file);
      const uploadRes = await base44.integrations.Core.UploadPrivateFile({ file });
      const fileUri = uploadRes?.data?.file_uri || uploadRes?.file_uri;

      const extractRes = await base44.functions.invoke("extractPackingSlip", {
        file_uri: fileUri,
        file_name: file.name,
        file_hash: hash,
        po_id: po?.id,
      });
      const data = extractRes?.data || extractRes;

      if (data.error) {
        if (data.duplicate) {
          setError(data.error);
          setStep("upload");
          return;
        }
        throw new Error(data.error);
      }

      setExtraction(data.extracted);
      setPackingSlipId(data.packing_slip_id);
      setReviewItems((data.items || []).map(item => ({
        ...item,
        confirmed_qty: item.quantity_shipped || 0,
        confirmed_unit_cost: item.unit_cost ?? "",
        confirmed_part_id: item.matched_part_id || "",
      })));
      setStep("review");
    } catch (e) {
      setError(e.message);
      setStep("upload");
    }
  };

  const updateReviewItem = (idx, field, value) => {
    setReviewItems(items => items.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const handleConfirm = async () => {
    setStep("receiving");
    setError(null);
    try {
      const confirmedItems = reviewItems
        .filter(it => Number(it.confirmed_qty) > 0 && it.po_line_idx != null)
        .map(it => ({
          line_idx: it.po_line_idx,
          part_id: it.confirmed_part_id || it.matched_part_id || "",
          qty: Number(it.confirmed_qty),
          unit_cost: it.confirmed_unit_cost !== "" ? Number(it.confirmed_unit_cost) : null,
        }));

      if (confirmedItems.length === 0) {
        setError("No items with a matched PO line and quantity > 0 to receive. Resolve unmatched items first.");
        setStep("review");
        return;
      }

      const res = await base44.functions.invoke("receiveByPackingSlip", {
        packing_slip_id: packingSlipId,
        po_id: po.id,
        confirmed_items: confirmedItems,
      });
      const data = res?.data || res;
      if (data.error) throw new Error(data.error);

      setResults(data);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["po", po.id] });
      qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
      qc.invalidateQueries({ queryKey: ["parts"] });
      qc.invalidateQueries({ queryKey: ["job-parts-tab"] });
      qc.invalidateQueries({ queryKey: ["job-reservations"] });
    } catch (e) {
      setError(e.message);
      setStep("review");
    }
  };

  const hasUnmatched = reviewItems.some(it => it.match_status === "unmatched");
  const hasAmbiguous = reviewItems.some(it => it.match_status === "ambiguous");
  const discrepancyCount = extraction?.discrepancies?.length || 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-emerald-600" />
            Receive by Packing Slip — {po?.po_number || ""}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="text-sm text-slate-500">
              Upload a packing slip or supplier invoice to extract proposed receipt data. The system will match items to this PO and your catalog — you review and confirm before anything is posted.
            </div>
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
              <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx" onChange={handleFileSelect} className="hidden" />
              <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-700">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-slate-400">({(file.size / 1024).toFixed(0)} KB)</span>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Click to select a packing slip (PDF, image, or spreadsheet)</p>
              )}
              <Button variant="outline" className="mt-4" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" /> Choose File
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              The original document is stored privately — no public URL, so access follows your app's permissions. Duplicate uploads of the same document are automatically detected and blocked. The packing slip is proof of shipment contents, not proof of payment.
            </p>
          </div>
        )}

        {step === "extracting" && (
          <div className="py-12 text-center">
            <Loader2 className="w-8 h-8 text-[#e20404] mx-auto mb-4 animate-spin" />
            <p className="text-sm text-slate-500">Extracting data from the packing slip and matching to PO & catalog...</p>
          </div>
        )}

        {step === "review" && extraction && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline">Supplier: {extraction.supplier_name || "Not detected"}</Badge>
              <Badge variant="outline">PO Ref: {extraction.po_reference || "Not detected"}</Badge>
            </div>

            {(hasUnmatched || hasAmbiguous || discrepancyCount > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                {hasUnmatched && <p className="text-xs text-amber-800 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {reviewItems.filter(it => it.match_status === "unmatched").length} item(s) could not be matched to the PO — these will not be received.</p>}
                {hasAmbiguous && <p className="text-xs text-amber-800 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {reviewItems.filter(it => it.match_status === "ambiguous").length} item(s) have ambiguous catalog matches — resolve before confirming.</p>}
                {discrepancyCount > 0 && <p className="text-xs text-amber-800 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {discrepancyCount} discrepancy(ies) detected between the slip and the PO.</p>}
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-400 uppercase">
                    <th className="text-left py-2 pr-2">Part #</th>
                    <th className="text-left py-2 pr-2">Description</th>
                    <th className="text-center py-2 px-2">Slip Qty</th>
                    <th className="text-center py-2 px-2">Receive Qty</th>
                    <th className="text-right py-2 px-2">Unit Cost</th>
                    <th className="text-center py-2 pl-2">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewItems.map((it, idx) => (
                    <tr key={idx} className={`border-b border-slate-100 ${it.match_status === "unmatched" ? "bg-red-50/50" : it.match_status === "ambiguous" ? "bg-amber-50/50" : ""}`}>
                      <td className="py-2 pr-2 font-mono text-xs">
                        {it.part_number || "—"}
                        {it.backordered_qty > 0 && <span className="text-amber-500 ml-1">(BO: {it.backordered_qty})</span>}
                      </td>
                      <td className="py-2 pr-2 text-slate-600 text-xs">{it.description || "—"}</td>
                      <td className="py-2 px-2 text-center text-slate-500">{it.quantity_shipped}</td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={it.confirmed_qty}
                          onChange={e => updateReviewItem(idx, "confirmed_qty", Number(e.target.value))}
                          className="h-8 w-16 text-center mx-auto"
                          min="0"
                          disabled={it.match_status === "unmatched"}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={it.confirmed_unit_cost}
                          onChange={e => updateReviewItem(idx, "confirmed_unit_cost", e.target.value)}
                          className="h-8 w-20 text-right ml-auto"
                          min="0"
                          step="0.01"
                          placeholder={it.unit_cost != null ? String(it.unit_cost) : "—"}
                        />
                      </td>
                      <td className="py-2 pl-2 text-center">
                        {it.match_status === "matched" && <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />}
                        {it.match_status === "unmatched" && <Badge className="bg-red-100 text-red-700 text-xs">Unmatched</Badge>}
                        {it.match_status === "ambiguous" && <Badge className="bg-amber-100 text-amber-700 text-xs">Ambiguous</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {extraction.discrepancies?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-medium text-amber-800 mb-1">Discrepancies:</p>
                {extraction.discrepancies.map((d, i) => (
                  <p key={i} className="text-xs text-amber-700">• {d.message}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "done" && results && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
              <span className="text-lg font-medium">Receipt posted successfully</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-[10px] uppercase font-semibold text-slate-500">Inventory Updated</p>
                <p className="text-2xl font-bold text-slate-900">{results.inventory_updates?.length || 0}</p>
                <p className="text-xs text-slate-400">part(s)</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-[10px] uppercase font-semibold text-slate-500">Shortages Resolved</p>
                <p className="text-2xl font-bold text-slate-900">{(results.shortage_allocations || []).reduce((s, a) => s + a.allocations.length, 0)}</p>
                <p className="text-xs text-slate-400">allocation(s)</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-[10px] uppercase font-semibold text-slate-500">Jobs Updated</p>
                <p className="text-2xl font-bold text-slate-900">{results.jobs_updated?.length || 0}</p>
                <p className="text-xs text-slate-400">job(s) ready</p>
              </div>
            </div>
            {results.jobs_updated?.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-xs font-medium text-emerald-800 mb-1">Jobs now ready (shortages resolved):</p>
                {results.jobs_updated.map(j => (
                  <p key={j.job_id} className="text-xs text-emerald-700">• {j.job_number} — {j.parts_readiness}</p>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400">PO status updated to: <Badge variant="outline" className="capitalize">{results.po_status}</Badge></p>
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleUpload} disabled={!file}>
                <Upload className="w-4 h-4 mr-2" /> Upload & Extract
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleConfirm}>
                <PackageCheck className="w-4 h-4 mr-2" /> Confirm Receipt
              </Button>
            </>
          )}
          {step === "done" && (
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleClose}>Done</Button>
          )}
          {step === "receiving" && (
            <Button disabled><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Posting receipt...</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}