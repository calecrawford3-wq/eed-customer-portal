import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldCheck, Clock, Printer, FileText, Tag, Image } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function IllegalPartsViewModal({ open, onClose, estimateId, invoiceId, customerEngineId, documentType }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || (!estimateId && !invoiceId && !customerEngineId)) return;
    setLoading(true);
    const queries = [];
    if (estimateId) queries.push(base44.entities.LegalDocument.filter({ estimate_id: estimateId }));
    if (invoiceId) queries.push(base44.entities.LegalDocument.filter({ invoice_id: invoiceId }));
    if (customerEngineId) queries.push(base44.entities.LegalDocument.filter({ customer_engine_id: customerEngineId }));
    Promise.all(queries)
      .then(results => {
        const all = results.flat();
        const filtered = documentType ? all.filter(d => d.document_type === documentType) : all;
        const active = filtered.find(d => d.status !== "void") || null;
        setDoc(active);
      })
      .catch(() => setDoc(null))
      .finally(() => setLoading(false));
  }, [open, estimateId, invoiceId, customerEngineId, documentType]);

  const adminSigned = !!doc?.admin_signature;
  const customerSigned = !!doc?.customer_signature;
  const fullySigned = adminSigned && customerSigned;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#e20404]">
            {doc?.document_type === "contract_engine"
              ? <><FileText className="w-5 h-5 text-blue-600" /> <span className="text-blue-700">Contract Engine Agreement</span></>
              : <><AlertTriangle className="w-5 h-5" /> Illegal Parts Acknowledgment</>
            }
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-[#e20404] rounded-full animate-spin" />
          </div>
        ) : !doc ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            No legal document found.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {fullySigned ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-0 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Fully Signed
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-700 border-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Awaiting Customer Signature
                </Badge>
              )}
              {adminSigned && <Badge className="bg-slate-100 text-slate-600 border-0">Admin Signed</Badge>}
              {customerSigned && <Badge className="bg-slate-100 text-slate-600 border-0">Customer Signed</Badge>}
            </div>

            {/* Document body */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-64 overflow-y-auto">
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans">{doc.body}</pre>
            </div>

            {/* Seal tag info for contract engines */}
            {doc.document_type === "contract_engine" && (doc.seal_tag_numbers || (doc.seal_tag_photos || []).length > 0) && (
              <div className="space-y-3">
                {doc.seal_tag_numbers && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-700 uppercase flex items-center gap-1 mb-1"><Tag className="w-3 h-3" /> Seal Tag Numbers</p>
                    <p className="text-sm font-mono text-blue-900">{doc.seal_tag_numbers}</p>
                  </div>
                )}
                {(doc.seal_tag_photos || []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1 mb-2"><Image className="w-3 h-3" /> Seal & Serial Photos</p>
                    <div className="grid grid-cols-3 gap-2">
                      {doc.seal_tag_photos.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`Seal photo ${i + 1}`} className="w-full h-24 object-cover rounded border border-slate-200 hover:opacity-90 transition-opacity" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Signatures */}
            <div className={adminSigned ? "grid grid-cols-2 gap-4" : "space-y-4"}>
              {adminSigned && (
                <div className="border border-slate-200 rounded-lg p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-2">Elite Engine Rep</p>
                  <img src={doc.admin_signature} alt="Admin signature" className="max-h-20 object-contain bg-white rounded border border-slate-100 p-1" />
                  <p className="text-xs text-slate-400 mt-2">
                    Signed {doc.admin_signed_at ? new Date(doc.admin_signed_at).toLocaleDateString() : ""}
                  </p>
                </div>
              )}
              <div className="border border-slate-200 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">Customer</p>
                {customerSigned ? (
                  <>
                    <img src={doc.customer_signature} alt="Customer signature" className="max-h-20 object-contain bg-white rounded border border-slate-100 p-1" />
                    <p className="text-xs text-slate-400 mt-2">
                      Signed {doc.customer_signed_at ? new Date(doc.customer_signed_at).toLocaleDateString() : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 italic">Not signed</p>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {doc && (
            <Button variant="outline" onClick={() => window.print()} className="mr-auto">
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}