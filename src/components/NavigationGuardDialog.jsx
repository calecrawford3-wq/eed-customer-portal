import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";

/**
 * Stay / Discard / Save & Leave dialog driven by a React Router blocker.
 *
 * Mounted inside each guarded page (EstimateDetail, InvoiceDetail) so it has
 * direct access to the blocker returned by useNavigationGuard.
 *
 * - Stay: blocker.reset() — cancel the block, stay on the document.
 * - Discard & Leave: blocker.proceed() — resume the navigation, discarding edits.
 * - Save & Leave: await onSave(); on success blocker.proceed(); on failure stay.
 *
 * When hasEditorDraft() is true, Save & Leave is replaced with a notice to
 * resolve the item editor first (apply or cancel the open draft), so we never
 * silently discard an unapplied item draft or save only the parent document.
 */
export default function NavigationGuardDialog({ blocker, onSave, hasEditorDraft }) {
  const [saving, setSaving] = useState(false);

  if (!blocker || blocker.state !== "blocked") return null;

  const editorDraft = typeof hasEditorDraft === "function" ? hasEditorDraft() : !!hasEditorDraft;

  const handleStay = () => blocker.reset();
  const handleDiscard = () => blocker.proceed();
  const handleSaveAndLeave = async () => {
    setSaving(true);
    try {
      const ok = await onSave();
      if (ok) { blocker.proceed(); return; }
      // Save failed — stay on the document, keep edits.
      blocker.reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) blocker.reset(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <DialogTitle>Unsaved changes</DialogTitle>
              <DialogDescription className="mt-1">
                {editorDraft
                  ? "You have an unapplied item in the editor. Apply or cancel it before leaving, or discard everything and leave."
                  : "You have unsaved changes to this document. Leaving will discard them."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {!editorDraft && (
            <Button
              className="w-full bg-[#e20404] hover:bg-[#c00303] text-white"
              onClick={handleSaveAndLeave}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {saving ? "Saving..." : "Save & Leave"}
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={handleDiscard} disabled={saving}>
            Discard & Leave
          </Button>
          <Button variant="ghost" className="w-full" onClick={handleStay} disabled={saving}>
            Stay on this page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}