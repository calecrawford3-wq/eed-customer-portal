import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, ScanLine } from "lucide-react";
import { toast } from "sonner";

const isMobileViewport = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

// Device-adaptive shop scanner:
// - mobile: rear camera opens automatically
// - desktop/web: keyboard-wedge / USB barcode scanner input
// There is intentionally no camera/USB mode switch in the normal workflow.
export default function BarcodeScanner({ onScan, autoFocus = true, placeholder = "Type or scan barcode...", preserveFullCode = false }) {
  const [mobile, setMobile] = useState(isMobileViewport);
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const readerId = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef(null);
  const startingRef = useRef(false);
  const inputRef = useRef(null);
  const lastScan = useRef("");
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const normalizeBarcode = (val) => {
    const trimmed = val.trim();
    if (preserveFullCode) return trimmed;
    return trimmed.length > 11 ? trimmed.slice(0, 11) : trimmed;
  };

  const stopCamera = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    startingRef.current = false;
    if (scanner) {
      try { await scanner.stop(); } catch (e) {}
      try { scanner.clear(); } catch (e) {}
    }
    setScanning(false);
  };

  const startCamera = async () => {
    if (scannerRef.current || startingRef.current || !mobile) return;
    setError("");
    startingRef.current = true;
    try {
      const el = document.getElementById(readerId.current);
      if (!el) { startingRef.current = false; return; }
      const scanner = new Html5Qrcode(readerId.current);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 160 }, aspectRatio: 1.4 },
        (decoded) => {
          if (decoded && decoded !== lastScan.current) {
            lastScan.current = decoded;
            onScanRef.current(normalizeBarcode(decoded));
            setTimeout(() => (lastScan.current = ""), 1200);
          }
        },
        () => {}
      );
      setScanning(true);
    } catch (e) {
      scannerRef.current = null;
      setError("Could not access camera. Check camera permission and try again.");
      setScanning(false);
      toast.error("Camera access failed");
    } finally {
      startingRef.current = false;
    }
  };

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (mobile) {
      const timer = setTimeout(() => { void startCamera(); }, 80);
      return () => { clearTimeout(timer); void stopCamera(); };
    }
    void stopCamera();
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 0);
    return undefined;
    // startCamera intentionally follows mobile lifecycle only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, autoFocus]);

  const submitManual = (e) => {
    e.preventDefault();
    const val = manual.trim();
    if (val) {
      onScan(normalizeBarcode(val));
      setManual("");
    }
  };

  if (mobile) {
    return (
      <div className="w-full flex flex-col items-center gap-3">
        <div id={readerId.current} className="w-full max-w-sm rounded-xl overflow-hidden border-2 border-slate-200 bg-black min-h-[220px]" />
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        {!scanning && (
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={startCamera}>
            <Camera className="w-4 h-4 mr-1" /> Open Camera
          </Button>
        )}
        {scanning && <p className="text-xs text-slate-400 text-center">Camera is ready. Point it at any Elite tag or supported barcode.</p>}
        <details className="w-full max-w-sm">
          <summary className="cursor-pointer text-xs text-center text-slate-500">Tag unreadable? Enter the printed ID manually</summary>
          <form onSubmit={submitManual} className="flex gap-2 mt-2">
            <Input className="font-mono" placeholder={placeholder} value={manual} onChange={e=>setManual(e.target.value)} />
            <Button type="submit" variant="outline">Enter</Button>
          </form>
        </details>
      </div>
    );
  }

  return (
    <form onSubmit={submitManual} className="flex gap-2 w-full">
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
      <Button type="submit" className="bg-[#e20404] hover:bg-[#c00303] text-white">Scan / Look Up</Button>
    </form>
  );
}
