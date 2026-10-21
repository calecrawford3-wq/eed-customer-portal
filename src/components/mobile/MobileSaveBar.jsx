import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Check, AlertCircle, Loader2, Save } from "lucide-react";

/**
 * Fixed mobile save bar that sits above the bottom navigation. Shows an
 * "Unsaved Changes" indicator when the document form differs from the last
 * confirmed-saved baseline, with a reachable Save Document action.
 *
 * The page owns the authoritative save-state (baselineRef) and passes `dirty`
 * as a prop — this component no longer maintains its own baseline, so the
 * mobile bar, desktop header Save, and Save & Leave all share one model.
 *
 * Props:
 *   dirty       — boolean, true when the form differs from the confirmed baseline
 *   onSave      — () => void, triggers the document save
 *   isSaving    — boolean, true while the save mutation is pending
 *   isError     — boolean, true if the last save attempt failed
 *   docVersion  — number; the page bumps this after loading a document (or
 *                 initializing a new one), which resets the "Saved" flash.
 *
 * Display priority: Saving > Save Failed > Unsaved Changes > Saved.
 * "Unsaved Changes" takes priority over "Saved" so edits made during a save
 * are never hidden behind a stale "Saved" message.
 */
export default function MobileSaveBar({ dirty = false, onSave, isSaving = false, isError = false, docVersion = 0 }) {
  const wasSaving = useRef(false);
  const [showSaved, setShowSaved] = useState(false);

  // Reset the "Saved" flash when the page signals a fresh document load/switch.
  useEffect(() => {
    setShowSaved(false);
    wasSaving.current = false;
  }, [docVersion]);

  // Handle save completion (success or failure).
  useEffect(() => {
    if (wasSaving.current && !isSaving) {
      wasSaving.current = false;
      if (!isError) {
        setShowSaved(true);
        const t = setTimeout(() => setShowSaved(false), 2000);
        return () => clearTimeout(t);
      }
      // On error: keep showing "Save Failed" via isError.
    }
    if (isSaving) wasSaving.current = true;
  }, [isSaving, isError]);

  const handleSave = useCallback(() => {
    if (isSaving) return;
    setShowSaved(false);
    onSave();
  }, [onSave, isSaving]);

  const visible = dirty || isSaving || showSaved || isError;

  return (
    <>
      {/* In-flow spacer reserves scroll space so the final fields, totals, and
          controls can scroll fully above the fixed save bar,
          including the iPhone safe-area inset. Only on mobile, only when the
          bar is visible — no unnecessary desktop padding. */}
      {visible && (
        <div className="md:hidden print:hidden" style={{ height: "calc(54px + env(safe-area-inset-bottom))" }} />
      )}
      {visible && createPortal(
        <div
          className="md:hidden fixed left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg print:hidden"
          style={{ bottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex items-center gap-3 px-4 py-2.5">
            {/* Status indicator — priority: Saving > Failed > Unsaved > Saved */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />
                  <span className="text-sm text-slate-500">Saving...</span>
                </>
              ) : isError ? (
                <>
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm text-red-500 font-medium">Save Failed — tap to retry</span>
                </>
              ) : dirty ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-sm text-slate-600 font-medium">Unsaved Changes</span>
                </>
              ) : showSaved ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-sm text-emerald-600 font-medium">Saved</span>
                </>
              ) : null}
            </div>
            {/* Save button */}
            <Button
              size="sm"
              className="bg-[#e20404] hover:bg-[#c00303] text-white h-9 px-4 shrink-0"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              {isSaving ? "Saving" : "Save Document"}
            </Button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}