import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Printer, Check } from "lucide-react";
import { printEngineLabel } from "./EngineLabelPrint";
import { toast } from "sonner";

const COMMON_LOCATIONS = ["Cart 1", "Cart 2", "Cart 3", "Tote 1", "Tote 2", "Tote 3", "Rack A-1", "Rack A-2", "Bench 1", "Bench 2"];

export default function StorageLocationPrompt({
  open,
  onClose,
  engineInfo,
  statusLabel,
  title,
  description,
  onConfirm,
}) {
  const [location, setLocation] = useState("");
  const [printed, setPrinted] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setLocation(engineInfo?.storageLocation || "");
      setPrinted(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, engineInfo]);

  const handlePrint = () => {
    if (!engineInfo?.serial) return;
    printEngineLabel({
      engineSerialNumber: engineInfo.serial,
      eedId: engineInfo.eedId,
      customerName: engineInfo.customerName,
      platformName: engineInfo.platformName,
      storageLocation: location,
      statusLabel: statusLabel,
      barcodeValue: engineInfo.serial,
    });
    setPrinted(true);
  };

  const handleConfirm = () => {
    if (!location.trim()) {
      toast.error("Please enter a storage location");
      return;
    }
    onConfirm?.(location.trim());
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#e20404]" /> {title || "Storage Location"}
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
          </div>
        )}

        {description && <p className="text-sm text-slate-600">{description}</p>}

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Storage Location *</Label>
            <Input
              ref={inputRef}
              placeholder="e.g., Cart 1, Tote 3, Rack A-2..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {COMMON_LOCATIONS.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setLocation(loc)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  location === loc
                    ? "border-[#e20404] bg-[#e20404] text-white"
                    : "border-slate-200 text-slate-600 hover:border-slate-400"
                }`}
              >
                {loc}
              </button>
            ))}
          </div>

          <div className="border-t pt-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={handlePrint}
              disabled={!location.trim() || !engineInfo?.serial}
            >
              <Printer className="w-4 h-4 mr-2" /> Print {statusLabel || "Engine"} Label
            </Button>
            {printed && (
              <p className="text-xs text-emerald-600 mt-1.5 text-center flex items-center justify-center gap-1">
                <Check className="w-3.5 h-3.5" /> Label sent to printer
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-[#e20404] hover:bg-[#c00303] text-white"
            onClick={handleConfirm}
            disabled={!location.trim()}
          >
            <Check className="w-4 h-4 mr-2" /> Confirm Location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}