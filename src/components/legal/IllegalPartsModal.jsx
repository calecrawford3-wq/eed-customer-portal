import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const ILLEGAL_PARTS_BODY = `ILLEGAL PARTS ACKNOWLEDGMENT & HOLD HARMLESS AGREEMENT

This document serves as formal acknowledgment that the engine build performed by Elite Engine Development contains parts, modifications, or components that may not be compliant with certain racing class rules, sanctioning body regulations, or emissions laws.

By signing below, the customer acknowledges and agrees that:

1. The customer has been informed that this engine build contains parts that may be considered illegal for certain racing classes, sanctioning bodies, or jurisdictions.

2. The customer assumes full responsibility for the use of this engine and all components therein, including but not limited to any consequences arising from the use of non-compliant or illegal parts.

3. Elite Engine Development, its owners, employees, and affiliates shall not be held liable for any penalties, fines, disqualifications, or legal actions resulting from the use of this engine or its components in any racing event, competition, or on public roads.

4. The customer has been given the opportunity to ask questions regarding the parts used and understands the implications of their use.

5. This agreement is binding and shall remain in effect for the lifetime of the engine build.

Customer Signature: _____________________        Date: ___________

`;

export default function IllegalPartsModal({ open, onClose, onSigned, estimateId, invoiceId, customerId, buildId }) {
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke("createLegalDocument", {
        document_type: "illegal_parts",
        title: "Illegal Parts Acknowledgment",
        body: ILLEGAL_PARTS_BODY,
        estimate_id: estimateId || null,
        invoice_id: invoiceId || null,
        customer_id: customerId,
        build_id: buildId || null,
      });
      if (res?.data?.error) {
        toast.error(res.data.error);
      } else {
        toast.success("Illegal Parts document created — customer will sign after approving the estimate");
        if (onSigned) onSigned(res.data.legal_document);
        onClose();
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Failed to create document";
      toast.error(msg);
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#e20404]">
            <AlertTriangle className="w-5 h-5" /> Illegal Parts Acknowledgment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              You are flagging this document as containing illegal parts. A legal acknowledgment will be generated and
              attached to this estimate. The customer will be required to sign it after approving the estimate, before
              they can make a payment.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-64 overflow-y-auto">
            <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans">{ILLEGAL_PARTS_BODY}</pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className="bg-[#e20404] hover:bg-[#c00303] text-white"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Creating...</> : "Create Document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}