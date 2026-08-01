import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function ConfirmDialog({ open, onClose, onConfirm, title = "Confirm", message, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "destructive" }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {variant === "destructive" && (
              <div className="bg-red-100 p-2 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
            )}
            {title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600 py-2">{message}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{cancelLabel}</Button>
          <Button
            className={variant === "destructive" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-[#e20404] hover:bg-[#c00303] text-white"}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}