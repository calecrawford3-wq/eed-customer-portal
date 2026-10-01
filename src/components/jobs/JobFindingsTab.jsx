import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ClipboardList, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";
import FindingCard from "@/components/jobs/FindingCard";
import FindingEditor from "@/components/jobs/FindingEditor";
import AdditionalWorkCard from "@/components/jobs/AdditionalWorkCard";
import AdditionalWorkDialog from "@/components/jobs/AdditionalWorkDialog";

export default function JobFindingsTab({ job, estimate, build, invoices }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // finding or "new"
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showAWDialog, setShowAWDialog] = useState(false);

  const findingsQ = useFindings(job.id);
  const workQ = useAdditionalWork(job.id);
  const findings = findingsQ.data || [];
  const workItems = workQ.data || [];

  const openFindings = findings.filter(f => f.status === "open" || f.status === "selected");
  const approvedUnprocessed = workItems.filter(w => w.status === "approved" && !w.processed_at);

  const toggleSelect = (id) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const onDeleteFinding = async (f) => {
    if (f.status === "approved" || f.additional_work_id) { toast.error("Finding is part of an additional-work request"); return; }
    await base44.entities.TeardownFinding.delete(f.id);
    qc.invalidateQueries({ queryKey: ["job-findings", job.id] });
    toast.success("Finding removed");
  };

  return (
    <div className="space-y-4">
      {approvedUnprocessed.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-sm text-amber-800">{approvedUnprocessed.length} approved additional-work item(s) not yet added to the invoice.</p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Teardown Findings</CardTitle>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303]" onClick={() => setShowAWDialog(true)}>
              Generate Additional Work ({selectedIds.size})
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}><Plus className="w-3.5 h-3.5 mr-1" /> Add Finding</Button>
        </div>
      </div>

      {findings.length === 0 ? (
        <Card className="border-0 shadow-sm"><CardContent><p className="text-sm text-slate-400 py-8 text-center">No teardown findings logged yet. Add inspection findings during teardown to generate additional-work approvals.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {findings.map(f => (
            <FindingCard key={f.id} finding={f} selected={selectedIds.has(f.id)} onToggleSelect={toggleSelect} onEdit={() => setEditing(f)} onDelete={() => onDeleteFinding(f)} />
          ))}
        </div>
      )}

      {workItems.length > 0 && (
        <div className="space-y-2 pt-2">
          <CardTitle className="text-sm">Additional-Work Approvals</CardTitle>
          {workItems.map(w => <AdditionalWorkCard key={w.id} aw={w} job={job} findings={findings} />)}
        </div>
      )}

      {editing && (
        <FindingEditor job={job} finding={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["job-findings", job.id] }); }} />
      )}
      {showAWDialog && (
        <AdditionalWorkDialog job={job} findings={openFindings.filter(f => selectedIds.has(f.id))} onClose={() => setShowAWDialog(false)} onSaved={() => { setShowAWDialog(false); setSelectedIds(new Set()); qc.invalidateQueries({ queryKey: ["job-findings", job.id] }); qc.invalidateQueries({ queryKey: ["job-additional-work", job.id] }); }} />
      )}
    </div>
  );
}

function useFindings(jobId) {
  return useQuery({ queryKey: ["job-findings", jobId], queryFn: () => base44.entities.TeardownFinding.filter({ job_id: jobId }, "-created_date", 200), enabled: !!jobId });
}
function useAdditionalWork(jobId) {
  return useQuery({ queryKey: ["job-additional-work", jobId], queryFn: () => base44.entities.AdditionalWork.filter({ job_id: jobId }, "-created_date", 50), enabled: !!jobId });
}