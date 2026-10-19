import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Check, AlertCircle, Loader2, Save } from "lucide-react";

/**
 * Fixed mobile save bar that sits above the bottom navigation. Shows an
 * "Unsaved Changes" indicator when the document form differs from the last
 * confirmed-saved snapshot, with a reachable Save Document action.
 *
 * Props:
 *   form        — the current form object (compared to a saved snapshot)
 *   onSave      — () => void, triggers the document save
 *   isSaving    — boolean, true while the save mutation is pending
 *   isError     — boolean, true if the last save attempt failed
 *   docVersion  — number; the page bumps this after loading a document from
 *                 the server (or initializing a new one), which resets the
 *                 saved baseline so a freshly-loaded doc does not falsely
 *                 show "unsaved".
 *
 * Only visible on mobile (md:hidden). Desktop save buttons remain in the
 * page header.
 *
 * Correctness notes:
 *  - The saved baseline tracks the EXACT snapshot submitted to and confirmed
 *    by the server (submittedRef), not the current form. So if the operator
 *    edits while a save is in progress, those later edits remain "Unsaved".
 *  - wasSaving is always reset to false after a save completes (success or
 *    error), preventing the stale-transition bug that re-flashed "Saved".
 *  - A failed save keeps the pre-save baseline, so edits stay dirty and a
 *    retry action is shown.
 *  - An in-flow spacer reserves scroll space so the final form fields and
 *    totals can scroll fully above the fixed bar + bottom navigation.
 */
export default function MobileSaveBar({ form, onSave, isSaving = false, isError = false, docVersion = 0 }) {
  const savedRef = useRef(null);       // JSON snapshot of the confirmed-saved state
  const submittedRef = useRef(null);   // JSON snapshot submitted to the server
  const wasSaving = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  // Reset baseline when the page signals a fresh document load/switch.
  useEffect(() => {
    if (form) {
      savedRef.current = JSON.stringify(form);
      submittedRef.current = null;
      setDirty(false);
      setShowSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docVersion]);

  // Initialize baseline on first non-null form (covers a brand-new doc whose
  // template is set before any docVersion bump).
  useEffect(() => {
    if (form && !savedRef.current) {
      savedRef.current = JSON.stringify(form);
    }
  }, [form]);

  // Recompute dirty whenever the form changes (user edits).
  useEffect(() => {
    if (!form || !savedRef.current) return;
    setDirty(JSON.stringify(form) !== savedRef.current);
  }, [form]);

  // Handle save completion (success or failure).
  useEffect(() => {
    if (wasSaving.current && !isSaving) {
      wasSaving.current = false;
      if (!isError && submittedRef.current) {
        // Success: the confirmed-saved state is exactly what we submitted,
        // NOT necessarily the current form (the user may have edited during
        // the save). Later edits therefore remain "Unsaved".
        savedRef.current = submittedRef.current;
        submittedRef.current = null;
        setDirty(form ? JSON.stringify(form) !== savedRef.current : false);
        setShowSaved(true);
        const t = setTimeout(() => setShowSaved(false), 2000);
        return () => clearTimeout(t);
      }
      // On error: keep savedRef as the pre-save baseline so edits stay dirty.
    }
    if (isSaving) wasSaving.current = true;
  }, [isSaving, isError, form]);

  const handleSave = useCallback(() => {
    if (isSaving || !form) return;
    submittedRef.current = JSON.stringify(form);
    wasSaving.current = true;
    setShowSaved(false);
    onSave();
  }, [onSave, isSaving, form]);

  if (!form) return null;

  const visible = dirty || isSaving || showSaved || isError;

  return (
    <>
      {/* In-flow spacer reserves scroll space so the final fields, totals, and
          controls can scroll fully above the fixed bar and bottom navigation,
          including the iPhone safe-area inset. Only on mobile, only when the
          bar is visible — no unnecessary desktop padding. */}
      {visible && (
        <div className="md:hidden print:hidden" style={{ height: "calc(54px + env(safe-area-inset-bottom))" }} />
      )}
      {visible && createPortal(
        <div
          className="md:hidden fixed left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg print:hidden"
          style={{ bottom: "calc(50px + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-3 px-4 py-2.5">
            {/* Status indicator */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />
                  <span className="text-sm text-slate-500">Saving...</span>
                </>
              ) : showSaved ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-sm text-emerald-600 font-medium">Saved</span>
                </>
              ) : isError ? (
                <>
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm text-red-500 font-medium">Save Failed — tap to retry</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-sm text-slate-600 font-medium">Unsaved Changes</span>
                </>
              )}
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