import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Save } from "lucide-react";
import { toast } from "sonner";

export default function ThreadNotesEditor({ thread, threadRecord }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(threadRecord?.internal_notes || "");
  }, [threadRecord?.id, threadRecord?.internal_notes]);

  const save = async () => {
    if (!threadRecord?.id) {
      toast.error("Thread record not synced yet — sync first so notes can be saved.");
      return;
    }
    setSaving(true);
    try {
      await base44.entities.EmailThread.update(threadRecord.id, { internal_notes: notes });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      toast.success("Notes saved");
    } catch (e) {
      toast.error("Couldn't save notes: " + (e?.message || "error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg bg-amber-50/40 border-amber-200 p-3">
      <div className="flex items-center gap-2 mb-1">
        <StickyNote className="w-4 h-4 text-amber-600" />
        <span className="text-xs font-medium text-amber-800">Internal notes (staff only — not sent or synced)</span>
      </div>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Add staff-only notes about this thread…"
        className="bg-white resize-y text-sm"
      />
      <div className="flex justify-end mt-2">
        <Button size="sm" onClick={save} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : "Save notes"}
        </Button>
      </div>
    </div>
  );
}