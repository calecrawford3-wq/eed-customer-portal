import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldCheck, Clock, Printer } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function IllegalPartsViewModal({ open, onClose, estimateId }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !estimateId) return;
    setLoading(true);
    base44.entities.LegalDocument.filter({ estimate_id: estimateId, document_type: "illegal_parts" })
      .then(docs => {
        const active = (docs || []).find(d => d.status !== "void") || null;
        setDoc(active);
      })
      .catch(() => setDoc(null))
      .finally(() => setLoading(false));
  }, [open, estimateId]);

  const adminSigned = !!doc?.admin_signature;
  const customerSigned = !!doc?.customer_signature;
  const fullySigned = adminSigned && customerSigned;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#e20404]">
            <AlertTriangle className="w-5 h-5" /> Illegal Parts Acknowledgment
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-[#e20404] rounded-full animate-spin" />
          </div>
        ) : !doc ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            No legal document found for this estimate.
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

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">Elite Engine Rep</p>
                {adminSigned ? (
                  <>
                    <img src={doc.admin_signature} alt="Admin signature" className="max-h-20 object-contain bg-white rounded border border-slate-100 p-1" />
                    <p className="text-xs text-slate-400 mt-2">
                      Signed {doc.admin_signed_at ? new Date(doc.admin_signed_at).toLocaleDateString() : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 italic">Not signed</p>
                )}
              </div>
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