import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer } from "lucide-react";
import { printEngineLabel } from "./EngineLabelPrint";

export default function ReprintLabelModal({ open, onClose, engineInfo, statusLabel = "COMPLETED" }) {
  const [note, setNote] = useState("");
  const [startPos, setStartPos] = useState(1);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setStartPos(1);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handlePrint = () => {
    if (!engineInfo?.serial) return;
    printEngineLabel({
      engineSerialNumber: engineInfo.serial,
      eedId: engineInfo.eedId,
      customerName: engineInfo.customerName,
      platformName: engineInfo.platformName,
      storageLocation: engineInfo.storageLocation,
      statusLabel,
      barcodeValue: engineInfo.serial,
      notes: note.trim() || undefined,
      startPos,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#e20404]" /> Reprint Engine Label
          </DialogTitle>
        </DialogHeader>

        {engineInfo && (
          <div className="bg-slate-50 rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-[#e20404] text-lg">{engineInfo.eedId || "—"}</span>
              <span className="text-sm font-semibold text-slate-700">{engineInfo.serial}</span>
            </div>
            {engineInfo.customerName && (
              <p className="text-xs text-slate-500">{engineInfo.customerName}</p>
            )}
            {engineInfo.platformName && (
              <p className="text-xs text-slate-400">{engineInfo.platformName}</p>
            )}
            {engineInfo.storageLocation && (
              <p className="text-xs text-slate-500 mt-1">📍 {engineInfo.storageLocation}</p>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs whitespace-nowrap text-slate-400">Start Slot</Label>
              <Input
                type="number"
                min="1"
                max="10"
                className="w-16 h-8 text-center text-xs"
                value={startPos}
                onChange={e => setStartPos(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="flex-1 space-y-0.5">
              <Input
                ref={inputRef}
                placeholder="Label note (e.g., Run-in oil, 20hr refresh)..."
                value={note}
                onChange={e => setNote(e.target.value.slice(0, 120))}
                maxLength={120}
                className="text-xs h-8"
              />
              <p className="text-[10px] text-slate-400 text-right">{note.length}/120</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-[#e20404] hover:bg-[#c00303] text-white"
            onClick={() => { handlePrint(); onClose(); }}
            disabled={!engineInfo?.serial}
          >
            <Printer className="w-4 h-4 mr-2" /> Print Label
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}