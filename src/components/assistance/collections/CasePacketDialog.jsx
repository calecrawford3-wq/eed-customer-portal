import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { buildCasePacketText, downloadCasePacket, printCasePacket } from "@/lib/casePacket";

// Printable / downloadable redacted referral packet. It never contains an SSN
// because Elite does not store one.
export default function CasePacketDialog({ caseDoc, loan, application, agreement, open, onOpenChange }) {
  const [preview, setPreview] = useState("");
  const text = buildCasePacketText({ caseDoc, loan, application, agreement });
  const filename = `${caseDoc?.case_number || "case"}-referral-packet.txt`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Redacted referral packet</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-slate-600">
            Prepared from the stored case file. No Social Security number, document image, date of birth or ID number is included, because Elite does not store them. Preparing or printing this packet does not submit anything.
          </p>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-slate-700">{preview || text}</pre>
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            variant="outline"
            onClick={() => {
              const ok = printCasePacket(text, `${caseDoc?.case_number || "Case"} referral packet`);
              if (!ok) toast.error("Allow pop-ups to print the packet");
            }}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button onClick={() => { downloadCasePacket(text, filename); setPreview(text); }}>
            <Download className="h-4 w-4" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}