import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Wrench, Package, Pencil, Trash2, MoreVertical, Cog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CannedJobDialog from "@/components/cannedjobs/CannedJobDialog";

export default function CannedJobs() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
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
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CannedJob.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cannedJobs"] });
      setDialogOpen(false);
      setEditingJob(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CannedJob.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cannedJobs"] }),
  });

  const filtered = cannedJobs.filter(j =>
    !search ||
    j.name?.toLowerCase().includes(search.toLowerCase()) ||
    j.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = (data) => {
    if (editingJob) {
      updateMutation.mutate({ id: editingJob.id, data });
    } else {
      createMutation.mutate(data);
    }
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
                      <DropdownMenuItem onClick={() => { setEditingJob(job); setDialogOpen(true); }}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit
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
        onClose={() => { setDialogOpen(false); setEditingJob(null); }}
        cannedJob={editingJob}
        onSave={handleSave}
        isPending={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}