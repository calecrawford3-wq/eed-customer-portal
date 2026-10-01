import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wrench, ArrowLeft, ScanLine, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import MachiningTaskCard from "@/components/machining/MachiningTaskCard";
import BarcodeScanner from "@/components/inventory/BarcodeScanner";

// Machining Station: a dedicated shop-floor screen for the machining area.
// Large text, large buttons, minimal navigation. Shows all engines currently
// in the machining stage with their machining task progress. Auto-refreshes.
const VIEW_TABS = [
  { key: "queued", label: "Queued" },
  { key: "in_progress", label: "In Progress" },
  { key: "blocked", label: "Blocked" },
  { key: "complete", label: "Machining Complete" },
];

export default function MachiningStation() {
  const qc = useQueryClient();
  const [view, setView] = useState("queued");
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  // Load all jobs in the machining stage
  const { data: jobsData, isLoading } = useQuery({
    queryKey: ["machining-station-jobs"],
    queryFn: () => base44.entities.Job.filter({ stage: "machining", is_active: true }, { sort: "-created_date", limit: 100 }),
    refetchInterval: 10000,
  });
  const jobs = jobsData?.items || jobsData || [];

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 300),
  });
  const { data: engines = [] } = useQuery({
    queryKey: ["customer-engines"],
    queryFn: () => base44.entities.CustomerEngine.list("-created_date", 300),
  });
  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  // Load machining tasks for all machining jobs in one query
  const jobIds = jobs.map(j => j.id);
  const { data: allTasksData } = useQuery({
    queryKey: ["machining-station-tasks", jobIds],
    queryFn: () => base44.entities.MachiningTask.filter({ job_id: { $in: jobIds } }, { sort: "sort_order", limit: 500 }),
    enabled: jobIds.length > 0,
    refetchInterval: 10000,
  });
  const allTasks = allTasksData?.items || allTasksData || [];

  // Group tasks by job
  const tasksByJob = useMemo(() => {
    const map = {};
    for (const t of allTasks) {
      if (!map[t.job_id]) map[t.job_id] = [];
      map[t.job_id].push(t);
    }
    return map;
  }, [allTasks]);

  // Enrich jobs with customer/engine info and machining progress
  const enrichedJobs = jobs.map(j => {
    const customer = customers.find(c => c.id === j.customer_id);
    const engine = engines.find(e => e.id === j.customer_engine_id);
    const platform = platforms.find(p => p.id === j.platform_id);
    const tasks = tasksByJob[j.id] || [];
    const completed = tasks.filter(t => t.status === "complete").length;
    const blocked = tasks.filter(t => t.status === "blocked").length;
    const inProgress = tasks.filter(t => t.status === "in_progress").length;
    return {
      ...j,
      _customer: customer ? `${customer.first_name} ${customer.last_name}`.trim() : "—",
      _engine: engine,
      _platform: platform ? `${platform.manufacturer} ${platform.name}` : "—",
      _tasks: tasks,
      _completed: completed,
      _blocked: blocked,
      _inProgress: inProgress,
      _progress: tasks.length ? `${completed} of ${tasks.length}` : "0 of 0",
    };
  });

  // Classify each job into a view based on its machining work status
  const classified = enrichedJobs.map(j => {
    let statusView = "queued";
    if (j._tasks.length === 0) statusView = "queued";
    else if (j._completed === j._tasks.length) statusView = "complete";
    else if (j._blocked > 0) statusView = "blocked";
    else if (j._inProgress > 0) statusView = "in_progress";
    else statusView = "queued";
    return { ...j, _machiningView: statusView };
  });

  const visibleJobs = classified.filter(j => j._machiningView === view);
  const selectedJob = enrichedJobs.find(j => j.id === selectedJobId);
  const selectedTasks = selectedJob?._tasks || [];

  const handleScan = (code) => {
    const match = enrichedJobs.find(j =>
      (j._engine?.eed_id || "").toLowerCase() === code.toLowerCase() ||
      (j._engine?.engine_serial_number || "").toLowerCase() === code.toLowerCase() ||
      (j.job_number || "").toLowerCase() === code.toLowerCase()
    );
    if (match) {
      setSelectedJobId(match.id);
      setShowScanner(false);
      toast.success(`Loaded ${match.job_number}`);
    } else {
      toast.error("No machining job found for scanned code");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-slate-950 px-4 md:px-8 py-4 flex-shrink-0 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center">
            <Wrench className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Machining Station</h1>
            <p className="text-slate-400 text-sm">Live shop view · auto-refreshes every 10s</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700 h-12 text-base" onClick={() => setShowScanner(true)}>
            <ScanLine className="w-5 h-5 mr-1" /> Scan
          </Button>
          <Link to="/Dashboard">
            <Button variant="ghost" className="text-slate-400 hover:text-white h-12">
              <ArrowLeft className="w-5 h-5 mr-1" /> Exit
            </Button>
          </Link>
        </div>
      </div>

      {/* View tabs */}
      <div className="bg-slate-900 px-4 md:px-8 py-3 flex-shrink-0 border-b border-slate-800">
        <div className="flex gap-2 flex-wrap">
          {VIEW_TABS.map(tab => {
            const count = classified.filter(j => j._machiningView === tab.key).length;
            const isActive = view === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`px-5 py-3 rounded-xl text-lg font-semibold transition-colors flex items-center gap-2 ${
                  isActive ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
                <span className={`text-sm rounded-full px-2 ${isActive ? "bg-purple-800" : "bg-slate-700"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Job grid */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {isLoading ? (
          <p className="text-slate-400 text-center text-lg py-12">Loading...</p>
        ) : visibleJobs.length === 0 ? (
          <div className="text-center py-16">
            <Wrench className="w-16 h-16 mx-auto mb-4 text-slate-700" />
            <p className="text-xl text-slate-500">No engines in this view</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleJobs.map(j => (
              <JobStationCard key={j.id} job={j} onOpen={() => setSelectedJobId(j.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Engine detail dialog with full checklist */}
      {selectedJob && (
        <Dialog open={true} onOpenChange={(o) => !o && setSelectedJobId(null)}>
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto bg-white text-slate-900">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                {selectedJob._customer}
                <span className="text-sm font-normal text-slate-400">{selectedJob.job_number}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
              <div>
                <p className="text-xs text-slate-400 uppercase">Engine</p>
                <p className="font-mono font-medium">{selectedJob._engine?.eed_id || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Serial</p>
                <p className="font-mono">{selectedJob._engine?.engine_serial_number || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Platform</p>
                <p>{selectedJob._platform}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Progress</p>
                <p className="font-bold text-purple-600 text-lg">{selectedJob._progress}</p>
              </div>
            </div>
            {selectedJob.blocking_condition && selectedJob.blocking_condition !== "none" && (
              <div className="mb-3 flex items-center gap-2 text-amber-700 bg-amber-50 p-2 rounded-lg text-sm">
                <span className="font-medium capitalize">{selectedJob.blocking_condition.replace(/_/g, " ")}</span>
              </div>
            )}
            {selectedTasks.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-3">No machining tasks planned.</p>
                <Link to={`/JobCard?id=${selectedJob.id}&tab=machining&plan=1`}>
                  <Button className="bg-[#e20404] hover:bg-[#c00303] text-white">Plan Machining</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedTasks.map(t => (
                  <MachiningTaskCard key={t.id} task={t} large />
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <Link to={`/JobCard?id=${selectedJob.id}&tab=machining`}>
                <Button variant="outline" size="sm">Open Job Card</Button>
              </Link>
              <Button variant="ghost" onClick={() => setSelectedJobId(null)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Scanner */}
      {showScanner && (
        <Dialog open={true} onOpenChange={(o) => !o && setShowScanner(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Scan Engine or Job</DialogTitle>
            </DialogHeader>
            <BarcodeScanner onScan={handleScan} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function JobStationCard({ job, onOpen }) {
  const tags = job.secondary_tags || [];
  const hasBlocking = job.blocking_condition && job.blocking_condition !== "none";
  const pct = job._tasks.length ? Math.round((job._completed / job._tasks.length) * 100) : 0;

  return (
    <div
      onClick={onOpen}
      className="bg-slate-800 rounded-2xl p-5 hover:bg-slate-700 hover:ring-2 hover:ring-purple-500 cursor-pointer transition-all border border-slate-700"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xl font-bold text-white">{job._customer}</p>
          <p className="text-sm text-slate-400 font-mono">{job.job_number}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-purple-400">{pct}%</p>
          <p className="text-xs text-slate-400">{job._progress} tasks</p>
        </div>
      </div>
      <div className="space-y-1 text-sm text-slate-300 mb-3">
        <p><span className="text-slate-500">Engine:</span> <span className="font-mono">{job._engine?.eed_id || "—"}</span></p>
        <p><span className="text-slate-500">S/N:</span> <span className="font-mono">{job._engine?.engine_serial_number || "—"}</span></p>
        <p><span className="text-slate-500">Platform:</span> {job._platform}</p>
      </div>
      {/* Progress bar */}
      <div className="h-3 bg-slate-700 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      {/* Blockers / tags */}
      {(hasBlocking || tags.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {hasBlocking && (
            <Badge className="text-xs bg-amber-900/50 text-amber-300 border-0">
              {job.blocking_condition.replace(/_/g, " ")}
            </Badge>
          )}
          {tags.map(tag => (
            <Badge key={tag} className="text-xs bg-slate-700 text-slate-300 border-0 capitalize">
              {tag.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}