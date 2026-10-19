import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Check, AlertCircle, Loader2, Save } from "lucide-react";

/**
 * Fixed mobile save bar that sits above the bottom navigation. Shows an
 * "Unsaved Changes" indicator when the document form differs from the last
 * saved snapshot, with a reachable Save Document action.
 *
 * Props:
 *   form     — the current form object (compared to a saved snapshot)
 *   onSave   — () => void, triggers the document save
 *   isSaving — boolean, true while the save mutation is pending
 *   isError  — boolean, true if the last save attempt failed
 *
 * Only visible on mobile (md:hidden). Desktop save buttons remain in the
 * page header.
 */
export default function MobileSaveBar({ form, onSave, isSaving = false, isError = false }) {
  const savedRef = useRef(null);
  const [dirty, setDirty] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const wasSaving = useRef(false);

  // Initialize the saved snapshot on first non-null form
  useEffect(() => {
    if (form && !savedRef.current) {
      savedRef.current = JSON.stringify(form);
    }
  }, [form]);

  // Track dirty by comparing current form to saved snapshot
  useEffect(() => {
    if (!form || !savedRef.current) return;
    setDirty(JSON.stringify(form) !== savedRef.current);
  }, [form]);

  // Detect transition from saving → not saving (success or error)
  useEffect(() => {
    if (wasSaving.current && !isSaving) {
      if (!isError) {
        // Success: update snapshot, flash "Saved"
        savedRef.current = JSON.stringify(form);
        setDirty(false);
        setShowSaved(true);
        const t = setTimeout(() => setShowSaved(false), 2000);
        return () => clearTimeout(t);
      }
    }
    wasSaving.current = isSaving;
  }, [isSaving, isError, form]);

  const handleSave = useCallback(() => {
    if (isSaving) return;
    wasSaving.current = true;
    onSave();
  }, [onSave, isSaving]);

  // Don't render if no form, not dirty, and not saving/saved/error
  if (!form) return null;
  if (!dirty && !isSaving && !showSaved && !isError) return null;

  return createPortal(
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
  );
}