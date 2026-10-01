import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Wrench, Package, Pencil, Trash2, MoreVertical, Cog, Copy, GitBranch, GitCompare, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CannedJobDialog from "@/components/cannedjobs/CannedJobDialog";
import VersionDiffModal from "@/components/cannedjobs/VersionDiffModal";

export default function CannedJobs() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [newVersionMode, setNewVersionMode] = useState(false);
  const [historyJob, setHistoryJob] = useState(null);
  const [diffPair, setDiffPair] = useState(null);
  const qc = useQueryClient();

  const { data: cannedJobs = [], isLoading } = useQuery({
    queryKey: ["cannedJobs"],
    queryFn: () => base44.entities.CannedJob.list("-created_date", 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.CannedJob.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cannedJobs"] });
      setDialogOpen(false);
      setEditingJob(null);
      setNewVersionMode(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CannedJob.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cannedJobs"] });
      setDialogOpen(false);
      setEditingJob(null);
      setNewVersionMode(false);
    },
  });

  const newVersionMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke("createCannedJobVersion", payload),
    onSuccess: (res) => {
      const data = res?.data || res;
      if (data?.error) { toast.error(data.error); return; }
      qc.invalidateQueries({ queryKey: ["cannedJobs"] });
      setDialogOpen(false);
      setEditingJob(null);
      setNewVersionMode(false);
      toast.success(`New version v${data?.new_version?.version || ""} created — old version preserved`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CannedJob.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cannedJobs"] }),
  });

  // Show only latest versions in the main grid; older versions are accessible via history
  const latestJobs = cannedJobs.filter(j => j.is_latest !== false);
  const filtered = latestJobs.filter(j =>
    !search ||
    j.name?.toLowerCase().includes(search.toLowerCase()) ||
    j.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = (data) => {
    if (newVersionMode && editingJob) {
      newVersionMutation.mutate({
        canned_job_id: editingJob.id,
        version_notes: data.version_notes || "",
        line_items: data.line_items,
        labor_items: data.labor_items,
        machining_items: data.machining_items,
        name: data.name,
        description: data.description,
      });
    } else if (editingJob) {
      updateMutation.mutate({ id: editingJob.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleNewVersion = (job) => {
    setEditingJob(job);
    setNewVersionMode(true);
    setDialogOpen(true);
  };

  const handleDuplicate = (job) => {
    createMutation.mutate({
      name: `${job.name} (Copy)`,
      description: job.description || "",
      line_items: job.line_items || [],
      labor_items: job.labor_items || [],
      machining_items: job.machining_items || [],
      status: "active",
      notes: job.notes || "",
    }, {
      onSuccess: () => toast.success(`Duplicated "${job.name}"`),
    });
  };

  const versionGroupJobs = (job) => {
    const gid = job.version_group_id || job.id;
    return cannedJobs.filter(j => (j.version_group_id || j.id) === gid).sort((a, b) => (b.version || 1) - (a.version || 1));
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Canned Jobs</h1>
          <p className="text-slate-500 mt-1">Reusable parts & labor templates for estimates</p>
        </div>
        <Button onClick={() => { setEditingJob(null); setDialogOpen(true); }} className="bg-[#e20404] hover:bg-[#c00303] text-white">
          <Plus className="w-4 h-4 mr-2" /> New Canned Job
        </Button>
      </div>

      <div className="relative flex-1 min-w-[240px] max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Search canned jobs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Wrench className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-900">No canned jobs found</h3>
          <p className="text-slate-500 mt-1">{search ? "Try adjusting your search" : "Create your first canned job"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(job => (
            <Card key={job.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs ${job.status === "active" || !job.status ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {job.status || "active"}
                      </Badge>
                      {job.version && job.version > 1 && (
                        <Badge className="text-xs bg-purple-100 text-purple-700 border-0">
                          <GitBranch className="w-3 h-3 mr-0.5" /> v{job.version}
                        </Badge>
                      )}
                      {(() => {
                        const versions = versionGroupJobs(job);
                        return versions.length > 1 ? (
                          <span className="text-[10px] text-slate-400">{versions.length} versions</span>
                        ) : null;
                      })()}
                    </div>
                    <p className="text-sm font-medium text-slate-700 mt-2 truncate">{job.name}</p>
                    {job.description && <p className="text-xs text-slate-400 line-clamp-2 mt-1">{job.description}</p>}
                    <div className="flex gap-3 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {(job.line_items || []).length} part{(job.line_items || []).length === 1 ? "" : "s"}</span>
                      <span className="flex items-center gap-1"><Wrench className="w-3 h-3" /> {(job.labor_items || []).length} labor</span>
                      {(job.machining_items || []).length > 0 && <span className="flex items-center gap-1"><Cog className="w-3 h-3" /> {(job.machining_items || []).length} machining</span>}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditingJob(job); setNewVersionMode(false); setDialogOpen(true); }}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleNewVersion(job)}>
                        <GitBranch className="w-4 h-4 mr-2" /> New Version
                      </DropdownMenuItem>
                      {versionGroupJobs(job).length > 1 && (
                        <DropdownMenuItem onClick={() => setHistoryJob(job)}>
                          <History className="w-4 h-4 mr-2" /> Version History
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleDuplicate(job)}>
                        <Copy className="w-4 h-4 mr-2" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteMutation.mutate(job.id)} className="text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CannedJobDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingJob(null); setNewVersionMode(false); }}
        cannedJob={editingJob}
        newVersionMode={newVersionMode}
        onSave={handleSave}
        isPending={createMutation.isPending || updateMutation.isPending || newVersionMutation.isPending}
      />

      {/* Version History Dialog */}
      <Dialog open={!!historyJob} onOpenChange={(o) => !o && setHistoryJob(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-purple-600" /> Version History — {historyJob?.name}
            </DialogTitle>
          </DialogHeader>
          {historyJob && (
            <div className="space-y-2">
              {versionGroupJobs(historyJob).map((v, i) => (
                <div key={v.id} className={`flex items-center gap-3 p-3 rounded-lg border ${v.is_latest !== false ? "border-purple-200 bg-purple-50/50" : "border-slate-200"}`}>
                  <div className="flex-shrink-0">
                    <Badge className={v.is_latest !== false ? "bg-purple-100 text-purple-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                      v{v.version || 1}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    {v.version_notes && <p className="text-xs text-slate-600">{v.version_notes}</p>}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {v.created_date ? new Date(v.created_date).toLocaleDateString() : ""}
                      {v.is_latest !== false && " · Latest"}
                    </p>
                  </div>
                  {i < versionGroupJobs(historyJob).length - 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7"
                      onClick={() => {
                        const versions = versionGroupJobs(historyJob);
                        setDiffPair({ oldVersion: versions[i + 1], newVersion: v });
                      }}
                    >
                      <GitCompare className="w-3.5 h-3.5 mr-1" /> Diff
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Version Diff Modal */}
      <VersionDiffModal
        open={!!diffPair}
        onClose={() => setDiffPair(null)}
        oldVersion={diffPair?.oldVersion}
        newVersion={diffPair?.newVersion}
      />
    </div>
  );
}