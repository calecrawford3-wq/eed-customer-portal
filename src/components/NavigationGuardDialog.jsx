import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { useBlockedNavigation, clearBlocked, proceedBlocked, saveAndProceed } from "@/hooks/useNavigationGuard";

/**
 * Renders a Stay / Discard / Save & Leave dialog whenever an internal
 * navigation is blocked by an active dirty guard. Mounted once in the Layout
 * so it covers all pages. Save & Leave waits for confirmed success before
 * navigating; on failure the user stays on the document with all edits
 * preserved.
 */
export default function NavigationGuardDialog() {
  const blocked = useBlockedNavigation();
  const [saving, setSaving] = useState(false);

  if (!blocked) return null;

  const handleStay = () => clearBlocked();
  const handleDiscard = () => proceedBlocked();
  const handleSaveAndLeave = async () => {
    setSaving(true);
    await saveAndProceed();
    setSaving(false);
  };

  return (
    <Dialog open={!!blocked} onOpenChange={(o) => { if (!o && !saving) clearBlocked(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <DialogTitle>Unsaved changes</DialogTitle>
              <DialogDescription className="mt-1">
                You have unsaved changes to this document. Leaving will discard them.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full bg-[#e20404] hover:bg-[#c00303] text-white"
            onClick={handleSaveAndLeave}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {saving ? "Saving..." : "Save & Leave"}
          </Button>
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