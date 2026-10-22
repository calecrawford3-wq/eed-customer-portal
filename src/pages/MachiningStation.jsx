import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wrench, ArrowLeft, ScanLine } from "lucide-react";
import { toast } from "sonner";
import MachiningTaskCard from "@/components/machining/MachiningTaskCard";
import BarcodeScanner from "@/components/inventory/BarcodeScanner";
import ComponentRepairTicketDialog from "@/components/inventory/ComponentRepairTicketDialog";

// Machining Station: a dedicated shop-floor screen for the machining area.
// Large text, large buttons, minimal navigation. Shows all engines currently
// in the machining stage with their machining task progress. Auto-refreshes.
const VIEW_TABS = [
  { key: "queued", label: "Queued" },
  { key: "in_progress", label: "In Progress" },
  { key: "blocked", label: "Blocked" },
  { key: "complete", label: "Machining Complete" },
  { key: "inventory_repairs", label: "Inventory Repairs" },
];

export default function MachiningStation() {
  const qc = useQueryClient();
  const [view, setView] = useState("queued");
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedRepairId, setSelectedRepairId] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  // Load all jobs in the machining stage
  const { data: jobsData, isLoading } = useQuery({
    queryKey: ["machining-station-jobs"],
    queryFn: () => base44.entities.Job.filter({ stage: "machining", is_active: true }, { sort: "-created_date", limit: 100 }),
    refetchInterval: 10000,
  });
  const jobs = Array.isArray(jobsData) ? jobsData : (jobsData?.items || []);

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

  const { data: components = [] } = useQuery({
    queryKey: ["machining-station-components"],
    queryFn: () => base44.entities.EngineComponent.list("-created_date", 1500),
    refetchInterval: 10000,
  });
  const { data: repairTickets = [] } = useQuery({
    queryKey: ["component-repair-tickets"],
    queryFn: () => base44.entities.ComponentRepairTicket.list("-created_at", 300),
    refetchInterval: 10000,
  });
  const openRepairTickets = repairTickets.filter(t => !["complete","cancelled"].includes(t.status));
  const repairTicketIds = openRepairTickets.map(t => t.id);
  const { data: repairTasksData = [] } = useQuery({
    queryKey: ["inventory-repair-tasks", repairTicketIds],
    queryFn: () => base44.entities.MachiningTask.filter({ repair_ticket_id: { $in: repairTicketIds } }, { sort: "sort_order", limit: 500 }),
    enabled: repairTicketIds.length > 0,
    refetchInterval: 10000,
  });
  const repairTasks = Array.isArray(repairTasksData) ? repairTasksData : (repairTasksData?.items || []);

  // Load machining tasks for all machining jobs in one query
  const jobIds = jobs.map(j => j.id);
  const { data: allTasksData } = useQuery({
    queryKey: ["machining-station-tasks", jobIds],
    queryFn: () => base44.entities.MachiningTask.filter({ job_id: { $in: jobIds } }, { sort: "sort_order", limit: 500 }),
    enabled: jobIds.length > 0,
    refetchInterval: 10000,
  });
  const allTasks = Array.isArray(allTasksData) ? allTasksData : (allTasksData?.items || []);

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
  const repairRows = openRepairTickets.map(t => {
    const component = components.find(c => c.id === t.component_id);
    const tasks = repairTasks.filter(x => x.repair_ticket_id === t.id);
    const completed = tasks.filter(x => x.status === "complete").length;
    return { ...t, _component: component, _tasks: tasks, _progress: `${completed} of ${tasks.length}` };
  });
  const selectedRepair = repairRows.find(r => r.id === selectedRepairId) || null;
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
      setSelectedRepairId(null);
      setShowScanner(false);
      toast.success(`Loaded ${match.job_number}`);
    } else {
      const repair = repairRows.find(r => [r.component_code, r._component?.tag_code].filter(Boolean).some(v => String(v).toLowerCase() === code.toLowerCase()));
      if (repair) { setSelectedRepairId(repair.id); setSelectedJobId(null); setShowScanner(false); toast.success(`Loaded ${repair.ticket_number}`); }
      else toast.error("No machining Job or inventory repair found for scanned code");
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
            const count = tab.key === "inventory_repairs" ? openRepairTickets.length : classified.filter(j => j._machiningView === tab.key).length;
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
        {view === "inventory_repairs" ? (
          repairRows.length === 0 ? <div className="text-center py-16"><Wrench className="w-16 h-16 mx-auto mb-4 text-slate-700"/><p className="text-xl text-slate-500">No inventory repairs in machining</p></div> :
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{repairRows.map(r => <RepairStationCard key={r.id} repair={r} onOpen={() => setSelectedRepairId(r.id)} />)}</div>
        ) : isLoading ? (
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

      {selectedRepair && <ComponentRepairTicketDialog open={true} onClose={() => setSelectedRepairId(null)} component={selectedRepair._component} ticketId={selectedRepair.id} />}

      {/* Scanner */}
      {showScanner && (
        <Dialog open={true} onOpenChange={(o) => !o && setShowScanner(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Scan Engine, Job, Head, or Case</DialogTitle>
            </DialogHeader>
            <BarcodeScanner onScan={handleScan} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function RepairStationCard({ repair, onOpen }) {
  const pending = repair._tasks.filter(t => t.status !== "complete").length;
  return <div onClick={onOpen} className="bg-slate-800 rounded-2xl p-5 hover:bg-slate-700 hover:ring-2 hover:ring-amber-500 cursor-pointer transition-all border border-slate-700">
    <div className="flex items-start justify-between gap-2"><div><p className="text-lg font-bold text-white font-mono">{repair.component_code}</p><p className="text-sm text-amber-300">{repair.ticket_number}</p></div><Badge className="bg-amber-900/50 text-amber-300 border-0">Inventory Repair</Badge></div>
    <p className="text-sm text-slate-300 mt-3 line-clamp-2">{repair.issue_reason || "Internal repair"}</p>
    <div className="mt-3 text-xs text-slate-400"><p>Progress: <span className="text-white font-semibold">{repair._progress}</span></p><p>Location: {repair._component?.storage_location || repair.storage_location || "—"}</p><p>Invested: ${Number(repair.total_invested_cost || 0).toFixed(2)}</p></div>
    <div className="mt-3"><span className={`text-xs rounded-full px-2 py-1 ${pending ? "bg-purple-900/60 text-purple-300" : "bg-emerald-900/60 text-emerald-300"}`}>{pending ? `${pending} task${pending===1?'':'s'} remaining` : "Ready to return to stock"}</span></div>
  </div>;
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