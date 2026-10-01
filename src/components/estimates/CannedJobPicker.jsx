import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wrench, Package, Search, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * CannedJobPicker - select a canned job and prefill estimate with its parts/labor template.
 * Props:
 *   open, onClose, onSelect(cannedJob) — called with the chosen canned job
 */
export default function CannedJobPicker({ open, onClose, onSelect }) {
  const [search, setSearch] = useState("");

  const { data: cannedJobs = [], isLoading } = useQuery({
    queryKey: ["cannedJobs"],
    queryFn: () => base44.entities.CannedJob.list("-created_date", 200),
    enabled: open,
  });

  const activeJobs = cannedJobs.filter(j => j.status === "active" || !j.status);
  const filtered = activeJobs.filter(j =>
    !search ||
    j.name?.toLowerCase().includes(search.toLowerCase()) ||
    j.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-purple-600" /> Select Canned Job
          </DialogTitle>
        </DialogHeader>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search canned jobs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" autoFocus />
        </div>

        {isLoading ? (
          <div className="text-center py-10 text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No canned jobs found. Create canned jobs first.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(job => (
              <div key={job.id} className="border border-slate-200 rounded-lg p-4 hover:border-purple-300 hover:bg-purple-50/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{job.name}</p>
                    {job.description && <p className="text-sm text-slate-500 mt-0.5">{job.description}</p>}
                    <div className="flex gap-3 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {(job.line_items || []).length} part{(job.line_items || []).length === 1 ? "" : "s"}</span>
                      <span className="flex items-center gap-1"><Wrench className="w-3 h-3" /> {(job.labor_items || []).length} labor</span>
                      {(job.machining_items || []).length > 0 && (
                        <span className="flex items-center gap-1"><Wrench className="w-3 h-3" /> {(job.machining_items || []).length} machining</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 text-white ml-3 shrink-0"
                    onClick={() => { onSelect(job); onClose(); }}
                  >
                    Use <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}