import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Edit3 } from "lucide-react";
import { toast } from "sonner";

export default function EmailDraftsModal({ open, onClose, onResume }) {
  const qc = useQueryClient();
  const { data: drafts = [] } = useQuery({
    queryKey: ["email-drafts"],
    queryFn: () => base44.entities.EmailDraft.list("-updated_date", 100),
    enabled: open,
  });

  const del = async (d) => {
    try {
      await base44.entities.EmailDraft.delete(d.id);
      qc.invalidateQueries({ queryKey: ["email-drafts"] });
      toast.success("Draft deleted");
    } catch (e) {
      toast.error("Delete failed: " + (e?.message || "error"));
    }
  };

  const resume = (d) => {
    onResume(d);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Drafts</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {drafts.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">No saved drafts. Use "Save draft" while composing to keep an unsent email.</p>
          ) : drafts.map((d) => (
            <div key={d.id} className="border rounded-lg p-3 bg-white">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => resume(d)} className="min-w-0 flex-1 text-left">
                  <div className="font-medium text-sm text-slate-900 truncate">
                    {d.subject || "(no subject)"}
                  </div>
                  <div className="text-xs text-slate-500 truncate">To: {d.to || "—"}</div>
                  <div className="text-xs text-slate-400 line-clamp-2 mt-0.5">{d.body || ""}</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {d.updated_date ? new Date(d.updated_date).toLocaleString() : ""}
                  </div>
                </button>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => resume(d)} title="Resume"><Edit3 className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete this draft?")) del(d); }} title="Delete" className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}