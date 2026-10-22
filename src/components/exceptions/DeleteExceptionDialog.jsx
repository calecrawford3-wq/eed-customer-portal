import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function DeleteExceptionDialog({ open, alert, busy = false, onClose, onConfirm }) {
  return <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Delete this exception?</DialogTitle></DialogHeader>
      <p className="text-sm text-slate-600">
        {alert?.title ? `“${alert.title}” will be removed from Elite. ` : 'This exception will be removed from Elite. '}
        If the underlying issue still exists, a future exception scan can create the alert again.
      </p>
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button disabled={busy} onClick={onConfirm} className="bg-red-600 text-white hover:bg-red-700">
          {busy ? 'Deleting…' : 'Delete Exception'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
