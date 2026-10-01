import React, { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";

// Max ms between keystrokes to be considered a barcode scanner (humans are 100ms+)
const INTER_KEY_THRESHOLD = 30;
const MIN_SCAN_LENGTH = 3;
const DEDUP_WINDOW = 1200;

// Detects USB barcode scanner input globally (rapid keystrokes + Enter) and
// looks up the scanned part/core, showing a toast with the result. Works on
// every admin page without navigating to the Barcode Scan page.
export default function GlobalBarcodeListener() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  useEffect(() => { pathnameRef.current = location.pathname; }, [location.pathname]);

  const bufferRef = useRef("");
  const lastTimeRef = useRef(0);
  const capturingRef = useRef(false);
  const lastScanRef = useRef({ code: "", time: 0 });
  const lookingUpRef = useRef(false);

  useEffect(() => {
    const normalizeBarcode = (val) => {
      const trimmed = val.trim();
      return trimmed.length > 11 ? trimmed.slice(0, 11) : trimmed;
    };

    const lookup = async (code) => {
      const now = Date.now();
      if (code === lastScanRef.current.code && now - lastScanRef.current.time < DEDUP_WINDOW) return;
      lastScanRef.current = { code, time: now };

      if (lookingUpRef.current) return;
      lookingUpRef.current = true;

      try {
        const [partsRes, coresRes] = await Promise.all([
          base44.entities.Part.filter({ part_number: code }),
          base44.entities.EngineCore.filter({ core_number: code }),
        ]);
        const parts = partsRes.items || partsRes || [];
        const cores = coresRes.items || coresRes || [];

        if (parts.length === 0 && cores.length === 0) {
          toast.error(`No item found for "${code}"`, {
            icon: <ScanLine className="w-4 h-4 text-slate-400" />,
            action: { label: "Scan Page", onClick: () => navigate(`/BarcodeScan?code=${encodeURIComponent(code)}`) },
          });
        } else {
          parts.forEach((p) => {
            toast.success(p.name, {
              icon: <ScanLine className="w-4 h-4 text-[#e20404]" />,
              description: `Part • Qty on hand: ${p.quantity_on_hand ?? 0}`,
              action: { label: "View", onClick: () => navigate(`/BarcodeScan?code=${encodeURIComponent(p.part_number)}`) },
            });
          });
          cores.forEach((c) => {
            toast.success(c.name, {
              icon: <ScanLine className="w-4 h-4 text-emerald-600" />,
              description: `Core • Qty on hand: ${c.quantity_on_hand ?? 0}`,
              action: { label: "View", onClick: () => navigate(`/BarcodeScan?code=${encodeURIComponent(c.core_number)}`) },
            });
          });
        }
      } catch (e) {
        toast.error("Scan lookup failed: " + (e.message || e));
      } finally {
        lookingUpRef.current = false;
      }
    };

    const onKeyDown = (e) => {
      // Ignore modifier-key combos (shortcuts)
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      // Let the Barcode Scan page handle its own input
      if (pathnameRef.current === "/BarcodeScan") return;

      const now = performance.now();

      if (e.key === "Enter") {
        if (capturingRef.current && bufferRef.current.length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          const code = normalizeBarcode(bufferRef.current);
          // Remove the leaked first character from a focused text input
          const activeEl = document.activeElement;
          if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") && !activeEl.readOnly) {
            const firstChar = bufferRef.current[0];
            if (firstChar && activeEl.value && activeEl.value.endsWith(firstChar)) {
              activeEl.value = activeEl.value.slice(0, -1);
              activeEl.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          lookup(code);
        }
        bufferRef.current = "";
        lastTimeRef.current = 0;
        capturingRef.current = false;
        return;
      }

      // Only track printable single characters
      if (e.key.length !== 1) return;

      const delta = lastTimeRef.current > 0 ? now - lastTimeRef.current : 9999;

      if (delta < INTER_KEY_THRESHOLD) {
        // Rapid input — scanner
        e.preventDefault();
        bufferRef.current += e.key;
        capturingRef.current = true;
      } else {
        // Slow — potential start of a scan
        bufferRef.current = e.key;
        capturingRef.current = false;
      }

      lastTimeRef.current = now;
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [navigate]);

  return null;
}