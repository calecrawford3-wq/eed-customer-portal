import React, { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ScanLine, Wrench, Briefcase, Package, Recycle, MapPin } from "lucide-react";
import { toast } from "sonner";

// Max ms between keystrokes to be considered a barcode scanner (humans are 100ms+)
const INTER_KEY_THRESHOLD = 30;
const MIN_SCAN_LENGTH = 3;
const DEDUP_WINDOW = 1200;

// Detects USB barcode scanner input globally (rapid keystrokes + Enter) on
// every admin page. Supports parts, cores, engines, jobs, and storage
// locations. Preserves the full barcode value — no truncation.
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
    const lookup = async (code) => {
      const now = Date.now();
      if (code === lastScanRef.current.code && now - lastScanRef.current.time < DEDUP_WINDOW) return;
      lastScanRef.current = { code, time: now };

      if (lookingUpRef.current) return;
      lookingUpRef.current = true;

      try {
        // Search all entity types in parallel using the full barcode value
        const [partsRes, coresRes, buildsRes, jobsRes] = await Promise.all([
          base44.entities.Part.filter({ part_number: code }),
          base44.entities.EngineCore.filter({ core_number: code }),
          base44.entities.EngineBuild.filter({ engine_serial_number: code }),
          base44.entities.Job.filter({ job_number: code }),
        ]);
        const parts = partsRes.items || partsRes || [];
        const cores = coresRes.items || coresRes || [];
        const builds = buildsRes.items || buildsRes || [];
        const jobs = jobsRes.items || jobsRes || [];

        const found = parts.length + cores.length + builds.length + jobs.length;

        if (found === 0) {
          // Fallback: try storage location lookup (engines at this location)
          const locRes = await base44.entities.EngineBuild.filter({ storage_location: code });
          const locBuilds = locRes.items || locRes || [];
          if (locBuilds.length > 0) {
            locBuilds.forEach(b => {
              toast.success(`${b.engine_serial_number} — ${b.eed_id || "No EED ID"}`, {
                icon: <MapPin className="w-4 h-4 text-amber-600" />,
                description: `Engine at location: ${code}`,
                action: { label: "View", onClick: () => navigate(`/BuildDetail?id=${b.id}`) },
              });
            });
          } else {
            toast.error(`No item found for "${code}"`, {
              icon: <ScanLine className="w-4 h-4 text-slate-400" />,
              action: { label: "Scan Page", onClick: () => navigate(`/BarcodeScan?code=${encodeURIComponent(code)}`) },
            });
          }
        } else {
          parts.forEach(p => {
            toast.success(p.name, {
              icon: <Package className="w-4 h-4 text-blue-600" />,
              description: `Part • Qty: ${p.quantity_on_hand ?? 0} • ${p.location || "No location"}`,
              action: { label: "View", onClick: () => navigate(`/BarcodeScan?code=${encodeURIComponent(p.part_number)}`) },
            });
          });
          cores.forEach(c => {
            toast.success(c.name, {
              icon: <Recycle className="w-4 h-4 text-emerald-600" />,
              description: `Core • Qty: ${c.quantity_on_hand ?? 0} • ${c.condition || ""}`,
              action: { label: "View", onClick: () => navigate(`/BarcodeScan?code=${encodeURIComponent(c.core_number)}`) },
            });
          });
          builds.forEach(b => {
            toast.success(`${b.engine_serial_number} — ${b.eed_id || "No EED ID"}`, {
              icon: <Wrench className="w-4 h-4 text-[#e20404]" />,
              description: `Build • Status: ${(b.status || "").replace("_", " ")}`,
              action: { label: "View", onClick: () => navigate(`/BuildDetail?id=${b.id}`) },
            });
          });
          jobs.forEach(j => {
            toast.success(`${j.job_number}`, {
              icon: <Briefcase className="w-4 h-4 text-slate-700" />,
              description: `Job • Stage: ${(j.stage || "").replace("_", " ")}`,
              action: { label: "View", onClick: () => navigate(`/JobCard?id=${j.id}`) },
            });
          });
        }
      } catch (e) {
        toast.error("Scan lookup failed: " + (e.message || e));
      } finally {
        lookingUpRef.current = false;
      }
    };

    const removeLeakedChar = (el, firstChar) => {
      if (!el || !firstChar) return;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        if (!el.readOnly && el.value && el.value.endsWith(firstChar)) {
          el.value = el.value.slice(0, -1);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } else if (el.isContentEditable) {
        // For Quill / contenteditable — delete the character before the cursor
        document.execCommand("delete", false, null);
      }
    };

    const onKeyDown = (e) => {
      // Ignore modifier-key combos (shortcuts)
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      // Let the Barcode Scan page handle its own input
      if (pathnameRef.current === "/BarcodeScan") return;
      // Don't interfere with inputs inside open dialogs (BarcodeVerifyModal, etc.)
      const activeEl = document.activeElement;
      if (activeEl && activeEl.closest && activeEl.closest("[role='dialog']")) return;

      const now = performance.now();

      if (e.key === "Enter") {
        if (capturingRef.current && bufferRef.current.length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          const code = bufferRef.current; // full barcode value — no truncation
          removeLeakedChar(activeEl, bufferRef.current[0]);
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