import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, CameraOff, Keyboard, ScanLine } from "lucide-react";
import { toast } from "sonner";

export default function BarcodeScanner({ onScan, autoFocus = true, placeholder = "Type or scan barcode..." }) {
  const [mode, setMode] = useState("usb");
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const readerId = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef(null);
  const inputRef = useRef(null);
  const lastScan = useRef("");

  useEffect(() => {
    if (autoFocus && mode === "usb") inputRef.current?.focus();
  }, [mode, autoFocus]);

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {}
      scannerRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => {
    if (mode !== "camera") {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const startCamera = async () => {
    setError("");
    try {
      const el = document.getElementById(readerId.current);
      if (!el) return;
      const scanner = new Html5Qrcode(readerId.current);
      scannerRef.current = scanner;
      setScanning(true);
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 160 }, aspectRatio: 1.4 },
        (decoded) => {
          if (decoded && decoded !== lastScan.current) {
            lastScan.current = decoded;
            onScan(decoded);
            setTimeout(() => (lastScan.current = ""), 1200);
          }
        },
        () => {}
      );
    } catch (e) {
      setError("Could not access camera. Check permissions or use a USB scanner.");
      setScanning(false);
      toast.error("Camera access failed");
    }
  };

  const submitManual = (e) => {
    e.preventDefault();
    const val = manual.trim();
    if (val) {
      onScan(val);
      setManual("");
    }
  };

  return (
    <div className="w-full">
      <div className="flex gap-2 mb-3">
        <Button
          type="button"
          size="sm"
          variant={mode === "usb" ? "default" : "outline"}
          onClick={() => setMode("usb")}
        >
          <Keyboard className="w-4 h-4 mr-1" /> USB Scanner
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "camera" ? "default" : "outline"}
          onClick={() => setMode("camera")}
        >
          <Camera className="w-4 h-4 mr-1" /> Camera
        </Button>
      </div>

      {mode === "usb" ? (
        <form onSubmit={submitManual} className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              ref={inputRef}
              className="pl-10 text-lg font-mono h-11"
              placeholder={placeholder}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
          </div>
          <Button type="submit" className="bg-[#e20404] hover:bg-[#c00303] text-white">Look Up</Button>
        </form>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div
            id={readerId.current}
            className="w-full max-w-sm rounded-lg overflow-hidden border-2 border-slate-200 bg-black min-h-[180px]"
          />
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          {scanning ? (
            <Button variant="outline" onClick={stopCamera}><CameraOff className="w-4 h-4 mr-1" /> Stop Camera</Button>
          ) : (
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={startCamera}><Camera className="w-4 h-4 mr-1" /> Start Camera</Button>
          )}
          <p className="text-xs text-slate-400 text-center">Point camera at the barcode. It will auto-detect and look up the item.</p>
        </div>
      )}
    </div>
  );
}