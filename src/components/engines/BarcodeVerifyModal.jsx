import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScanLine, ShieldCheck, Lock, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function BarcodeVerifyModal({
  open,
  onClose,
  expectedSerial,
  engineInfo,
  title = "Verify Engine",
  description = "Scan the barcode on the engine label to confirm you are modifying the correct engine.",
  onVerified,
}) {
  const [mode, setMode] = useState("scan");
  const [scannedValue, setScannedValue] = useState("");
  const [bypassPassword, setBypassPassword] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const { data: settings = {} } = useQuery({
    queryKey: ["appSettings"],
    queryFn: async () => {
      const list = await base44.entities.AppSettings.filter({ key: "global" });
      return list?.[0] || {};
    },
    enabled: open && mode === "bypass",
  });

  useEffect(() => {
    if (open) {
      setMode("scan");
      setScannedValue("");
      setBypassPassword("");
      setError("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleScan = (val) => {
    const clean = val.trim();
    if (!clean) return;
    setScannedValue(clean);
    if (clean === expectedSerial) {
      toast.success("Engine verified!");
      onVerified?.(clean, "scan");
      onClose?.();
    } else {
      setError(`Scanned "${clean}" does not match engine "${expectedSerial}"`);
      setScannedValue("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleBypass = () => {
    const adminPassword = settings?.admin_override_password;
    if (!adminPassword) {
      // No password set — any non-empty input works for admin users
      if (!bypassPassword.trim()) {
        setError("Enter a reason or password to bypass (no admin password configured in Settings)");
        return;
      }
    } else {
      if (bypassPassword !== adminPassword) {
        setError("Incorrect admin password");
        return;
      }
    }
    toast.success("Admin bypass authorized");
    onVerified?.(expectedSerial, "bypass");
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#e20404]" /> {title}
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

        <p className="text-sm text-slate-600">{description}</p>

        {mode === "scan" ? (
          <div className="space-y-3">
            <form
              onSubmit={(e) => { e.preventDefault(); handleScan(scannedValue); }}
              className="space-y-2"
            >
              <Label>Scan Engine Barcode</Label>
              <div className="relative">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  ref={inputRef}
                  className="pl-10 text-lg font-mono h-12"
                  placeholder="Scan or type serial number..."
                  value={scannedValue}
                  onChange={(e) => { setScannedValue(e.target.value); setError(""); }}
                  autoFocus
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Button type="submit" className="w-full bg-[#e20404] hover:bg-[#c00303] text-white">
                <CheckCircle2 className="w-4 h-4 mr-2" /> Verify
              </Button>
            </form>
            <div className="text-center">
              <Button variant="link" size="sm" className="text-slate-400" onClick={() => { setMode("bypass"); setError(""); setBypassPassword(""); }}>
                <Lock className="w-3.5 h-3.5 mr-1" /> Admin Bypass
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Admin Override Password</Label>
              <Input
                type="password"
                placeholder="Enter admin password..."
                value={bypassPassword}
                onChange={(e) => { setBypassPassword(e.target.value); setError(""); }}
                autoFocus
              />
              <p className="text-xs text-slate-400">
                {settings?.admin_override_password
                  ? "Enter the admin override password configured in Settings."
                  : "No admin password configured. Enter any reason/initials to bypass."}
              </p>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setMode("scan"); setError(""); }}>
                Back to Scan
              </Button>
              <Button className="flex-1 bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleBypass}>
                <ShieldCheck className="w-4 h-4 mr-2" /> Authorize Bypass
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}