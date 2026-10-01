import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * SnoozeExceptionDialog — lets an admin snooze an exception alert
 * with a reason and a return date. The underlying record is not changed.
 */
export default function SnoozeExceptionDialog({ open, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");

  const handleConfirm = () => {
    if (!until) return;
    onConfirm({ snooze_reason: reason, snooze_until: until });
    setReason("");
    setUntil("");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Snooze Alert</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why are you deferring this alert?"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Reactivate on *</Label>
            <Input
              type="date"
              value={until}
              onChange={e => setUntil(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
            <p className="text-xs text-slate-400">The alert will reappear on this date if the issue is still open.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleConfirm} disabled={!until}>
            Snooze
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}