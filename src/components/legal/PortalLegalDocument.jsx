import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldCheck, Clock, FileText, Tag, Image as ImageIcon, PenLine, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import SignaturePad from "@/components/SignaturePad";

export default function PortalLegalDocument({ doc, onSigned }) {
  const [open, setOpen] = useState(false);
  const [signMode, setSignMode] = useState(false);
  const [signature, setSignature] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedDoc, setSignedDoc] = useState(null);

  if (!doc) return null;

  const currentDoc = signedDoc || doc;
  const isContract = currentDoc.document_type === "contract_engine";
  const customerSigned = !!currentDoc.customer_signature;
  const adminSigned = !!currentDoc.admin_signature;
  const fullySigned = isContract ? (adminSigned && customerSigned) : customerSigned;

  // Customer can sign if: not void, not already signed, and (for contract_engine) admin has signed first
  const canSign = currentDoc.status !== "void" && !customerSigned && (!isContract || adminSigned);
  const awaitingAdmin = isContract && !adminSigned;

  const accent = isContract
    ? { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600", title: "text-blue-800", sub: "text-blue-600", btn: "border-blue-300 text-blue-700" }
    : { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600", title: "text-amber-800", sub: "text-amber-600", btn: "border-amber-300 text-amber-700" };

  const label = isContract ? "Contract Engine Agreement" : "Illegal Parts Acknowledgment";
  const Icon = isContract ? FileText : AlertTriangle;

  const handleSign = async () => {
    if (!signature) {
      toast.error("Please draw your signature first.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("signLegalDocument", {
        publicAccessToken: currentDoc.public_access_token,
        customerSignature: signature,
      });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);

      // Update local state so the UI reflects the signature immediately
      const updated = {
        ...currentDoc,
        customer_signature: signature,
        customer_signed_at: new Date().toISOString(),
        status: "fully_signed",
      };
      setSignedDoc(updated);
      setSignMode(false);
      setSignature(null);
      toast.success(`${label} signed successfully!`);
      if (onSigned) onSigned();
    } catch (err) {
      toast.error(err.message || "Failed to sign document. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSignMode(false);
    setSignature(null);
  };

  return (
    <>
      <div className={`${accent.bg} border ${accent.border} rounded-lg p-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${accent.icon} flex-shrink-0`} />
          <div>
            <p className={`text-sm font-medium ${accent.title}`}>{label}</p>
            <p className={`text-xs ${accent.sub}`}>
              {fullySigned
                ? `Signed${currentDoc.customer_signed_at ? ` ${new Date(currentDoc.customer_signed_at).toLocaleDateString()}` : ""}`
                : canSign
                  ? "Ready to sign"
                  : "Awaiting signature"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canSign && !fullySigned && (
            <Button
              size="sm"
              className={`${isContract ? "bg-blue-600 hover:bg-blue-700" : "bg-[#e20404] hover:bg-red-700"} text-white text-xs h-7`}
              onClick={() => setOpen(true)}
            >
              <PenLine className="w-3 h-3 mr-1" /> Sign
            </Button>
          )}
          <Button size="sm" variant="outline" className={`${accent.btn} text-xs h-7`} onClick={() => setOpen(true)}>
            <FileText className="w-3 h-3 mr-1" /> View
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(v); }}>
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
              ) : awaitingAdmin ? (
                <Badge className="bg-slate-100 text-slate-600 border-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Awaiting Elite Engine Rep Signature
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-700 border-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Awaiting Your Signature
                </Badge>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-64 overflow-y-auto">
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans">{currentDoc.body}</pre>
            </div>

            {/* Seal tag info for contract engines */}
            {isContract && (currentDoc.seal_tag_numbers || (currentDoc.seal_tag_photos || []).length > 0) && (
              <div className="space-y-3">
                {currentDoc.seal_tag_numbers && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-700 uppercase flex items-center gap-1 mb-1"><Tag className="w-3 h-3" /> Seal Tag Numbers</p>
                    <p className="text-sm font-mono text-blue-900">{currentDoc.seal_tag_numbers}</p>
                  </div>
                )}
                {(currentDoc.seal_tag_photos || []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1 mb-2"><ImageIcon className="w-3 h-3" /> Seal & Serial Photos</p>
                    <div className="grid grid-cols-3 gap-2">
                      {currentDoc.seal_tag_photos.map((url, i) => (
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
                  <img src={currentDoc.admin_signature} alt="Admin signature" className="max-h-20 object-contain bg-white rounded border border-slate-100 p-1" />
                  <p className="text-xs text-slate-400 mt-2">
                    Signed {currentDoc.admin_signed_at ? new Date(currentDoc.admin_signed_at).toLocaleDateString() : ""}
                  </p>
                </div>
              )}
              <div className="border border-slate-200 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">Customer</p>
                {customerSigned ? (
                  <>
                    <img src={currentDoc.customer_signature} alt="Customer signature" className="max-h-20 object-contain bg-white rounded border border-slate-100 p-1" />
                    <p className="text-xs text-slate-400 mt-2">
                      Signed {currentDoc.customer_signed_at ? new Date(currentDoc.customer_signed_at).toLocaleDateString() : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 italic">Not signed</p>
                )}
              </div>
            </div>

            {/* Signing pad */}
            {canSign && !customerSigned && (
              <div className="border-t border-slate-200 pt-4">
                {awaitingAdmin ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                    <Clock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">This document is awaiting the Elite Engine Rep's signature. Once they sign, you'll be able to sign here.</p>
                  </div>
                ) : signMode ? (
                  <div className="space-y-3">
                    <SignaturePad onChange={setSignature} label="Draw your signature below to sign this agreement" height={160} />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => { setSignMode(false); setSignature(null); }} disabled={submitting}>
                        Cancel
                      </Button>
                      <Button
                        className={isContract ? "bg-blue-600 hover:bg-blue-700" : "bg-[#e20404] hover:bg-red-700"}
                        onClick={handleSign}
                        disabled={!signature || submitting}
                      >
                        {submitting ? (
                          <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Submitting...</>
                        ) : (
                          <><PenLine className="w-4 h-4 mr-1" /> Confirm Signature</>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <Button
                      className={isContract ? "bg-blue-600 hover:bg-blue-700" : "bg-[#e20404] hover:bg-red-700"}
                      onClick={() => setSignMode(true)}
                    >
                      <PenLine className="w-4 h-4 mr-1" /> Sign This Document
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}