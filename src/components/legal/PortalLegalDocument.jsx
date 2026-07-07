import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldCheck, Clock, FileText } from "lucide-react";

export default function PortalLegalDocument({ doc }) {
  const [open, setOpen] = useState(false);

  if (!doc) return null;

  const customerSigned = !!doc.customer_signature;

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Illegal Parts Acknowledgment</p>
            <p className="text-xs text-amber-600">
              {customerSigned
                ? `Signed ${doc.customer_signed_at ? new Date(doc.customer_signed_at).toLocaleDateString() : ""}`
                : "Awaiting signature"}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 text-xs h-7" onClick={() => setOpen(true)}>
          <FileText className="w-3 h-3 mr-1" /> View
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#e20404]">
              <AlertTriangle className="w-5 h-5" /> Illegal Parts Acknowledgment
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {customerSigned ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-0 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Fully Signed
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-700 border-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Awaiting Signature
                </Badge>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-64 overflow-y-auto">
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans">{doc.body}</pre>
            </div>

            {customerSigned && (
              <div className="border border-slate-200 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">Customer Signature</p>
                <img src={doc.customer_signature} alt="Customer signature" className="max-h-20 object-contain bg-white rounded border border-slate-100 p-1" />
                <p className="text-xs text-slate-400 mt-2">
                  Signed {doc.customer_signed_at ? new Date(doc.customer_signed_at).toLocaleDateString() : ""}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}