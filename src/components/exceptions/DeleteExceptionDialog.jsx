import React from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export default function DeleteExceptionDialog({ open, alert, busy = false, onClose, onConfirm }) {
  return <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this exception?</AlertDialogTitle>
        <AlertDialogDescription>
          {alert?.title ? `“${alert.title}” will be removed from Elite. ` : 'This exception will be removed from Elite. '}
          If the underlying issue still exists, a future exception scan can create the alert again.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
        <AlertDialogAction disabled={busy} onClick={onConfirm} className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600">
          {busy ? 'Deleting…' : 'Delete Exception'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
