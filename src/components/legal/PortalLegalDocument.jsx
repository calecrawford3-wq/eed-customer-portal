import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldCheck, Clock, FileText, Tag, Image as ImageIcon } from "lucide-react";

export default function PortalLegalDocument({ doc }) {
  const [open, setOpen] = useState(false);

  if (!doc) return null;

  const isContract = doc.document_type === "contract_engine";
  const customerSigned = !!doc.customer_signature;
  const adminSigned = !!doc.admin_signature;
  const fullySigned = isContract ? (adminSigned && customerSigned) : customerSigned;

  const accent = isContract
    ? { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600", title: "text-blue-800", sub: "text-blue-600", btn: "border-blue-300 text-blue-700" }
    : { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600", title: "text-amber-800", sub: "text-amber-600", btn: "border-amber-300 text-amber-700" };

  const label = isContract ? "Contract Engine Agreement" : "Illegal Parts Acknowledgment";
  const Icon = isContract ? FileText : AlertTriangle;

  return (
    <>
      <div className={`${accent.bg} border ${accent.border} rounded-lg p-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${accent.icon} flex-shrink-0`} />
          <div>
            <p className={`text-sm font-medium ${accent.title}`}>{label}</p>
            <p className={`text-xs ${accent.sub}`}>
              {fullySigned
                ? `Signed${doc.customer_signed_at ? ` ${new Date(doc.customer_signed_at).toLocaleDateString()}` : ""}`
                : "Awaiting signature"}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className={`${accent.btn} text-xs h-7`} onClick={() => setOpen(true)}>
          <FileText className="w-3 h-3 mr-1" /> View
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${isContract ? "text-blue-700" : "text-[#e20404]"}`}>
              <Icon className={`w-5 h-5 ${accent.icon}`} /> {label}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {fullySigned ? (
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

            {/* Seal tag info for contract engines */}
            {isContract && (doc.seal_tag_numbers || (doc.seal_tag_photos || []).length > 0) && (
              <div className="space-y-3">
                {doc.seal_tag_numbers && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-700 uppercase flex items-center gap-1 mb-1"><Tag className="w-3 h-3" /> Seal Tag Numbers</p>
                    <p className="text-sm font-mono text-blue-900">{doc.seal_tag_numbers}</p>
                  </div>
                )}
                {(doc.seal_tag_photos || []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1 mb-2"><ImageIcon className="w-3 h-3" /> Seal & Serial Photos</p>
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}