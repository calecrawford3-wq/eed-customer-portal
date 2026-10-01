import React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatPhoneDisplay, getErrorMessage } from "@/lib/messagingUtils";

export default function DeleteConversationDialog({
  open,
  onOpenChange,
  selectedPhone,
  messageCount,
  deleteConfirmation,
  setDeleteConfirmation,
  onDelete,
  isPending,
  error,
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (isPending) return;
        onOpenChange(open);
        if (!open) setDeleteConfirmation("");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">Delete Entire Conversation</DialogTitle>
          <DialogDescription>
            This permanently deletes every stored message in this conversation from the app. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">Conversation</p>
            <p className="text-sm text-red-700 mt-1">
              {selectedPhone ? formatPhoneDisplay(selectedPhone) : ""}
            </p>
            <p className="text-xs text-red-600 mt-1">
              {messageCount} stored message{messageCount === 1 ? "" : "s"} will be deleted.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">
              Type DELETE to confirm
            </label>
            <Input
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              onKeyDown={(event) => {
                if (event.key === "Enter" && deleteConfirmation === "DELETE" && !isPending) {
                  onDelete();
                }
              }}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">
              {getErrorMessage(error, "Unable to delete conversation.")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={onDelete}
            disabled={deleteConfirmation !== "DELETE" || isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Permanently Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}