import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Search, LayoutGrid, List, Archive, ArchiveRestore, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STAGE_GROUPS = [
  { key: "awaiting_approval", label: "Awaiting Approval", color: "bg-slate-100 text-slate-600", active: false },
  { key: "awaiting_deposit", label: "Awaiting Deposit", color: "bg-amber-100 text-amber-700", active: false },
  { key: "queued", label: "Queued", color: "bg-blue-100 text-blue-700", active: true },
  { key: "teardown", label: "Teardown / Inspection", color: "bg-indigo-100 text-indigo-700", active: true },
  { key: "machining", label: "Machining", color: "bg-purple-100 text-purple-700", active: true },
  { key: "assembly", label: "Assembly", color: "bg-violet-100 text-violet-700", active: true },
  { key: "testing", label: "Testing", color: "bg-cyan-100 text-cyan-700", active: true },
  { key: "ready_for_pickup", label: "Ready for Pickup", color: "bg-emerald-100 text-emerald-700", active: true },
  { key: "picked_up", label: "Picked Up / Shipped", color: "bg-slate-200 text-slate-600", active: true },
];

const BLOCKING_LABELS = {
  waiting_on_parts: "Waiting on Parts",
  waiting_on_approval: "Waiting on Approval",
  waiting_on_customer: "Waiting on Customer",
};

const PARTS_LABELS = {
  ready: { label: "Parts Ready", cls: "bg-emerald-100 text-emerald-700" },
  partially_supplied: { label: "Partial Supply", cls: "bg-amber-100 text-amber-700" },
  waiting_on_parts: { label: "Waiting on Parts", cls: "bg-red-100 text-red-700" },
  unknown: { label: "—", cls: "bg-slate-100 text-slate-400" },
};

export default function Jobs() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState("board"); // board | list
  const [showArchive, setShowArchive] = useState(false);
  const [filterBlocking, setFilterBlocking] = useState("all");

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", showArchive],
    queryFn: () => base44.entities.Job.filter({ archived: showArchive }, "-created_date", 500),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });
  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const customerName = (id) => {
    const c = customers.find(c => c.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "";
  };
  const platformLabel = (id) => {
    const p = platforms.find(p => p.id === id);
    return p ? `${p.manufacturer} ${p.name}` : "";
  };

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      if (filterBlocking !== "all" && j.blocking_condition !== filterBlocking) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      const cn = customerName(j.customer_id).toLowerCase();
      return (j.job_number || "").toLowerCase().includes(q) || cn.includes(q) || (j.storage_location || "").toLowerCase().includes(q);
    });
  }, [jobs, search, filterBlocking, customers]);

  const byStage = useMemo(() => {
    const map = {};
    for (const g of STAGE_GROUPS) map[g.key] = [];
    for (const j of filtered) {
      // Jobs with a blocking condition show in their stage group but flagged
      if (map[j.stage]) map[j.stage].push(j);
    }
    return map;
  }, [filtered]);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
          <p className="text-slate-500 text-sm mt-1">Unified job workspace — estimate through pickup</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search jobs, customers, locations..."
              className="pl-9 w-64"
            />
          </div>
          <select
            value={filterBlocking}
            onChange={e => setFilterBlocking(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="all">All conditions</option>
            <option value="none">No blocks</option>
            <option value="waiting_on_parts">Waiting on Parts</option>
            <option value="waiting_on_approval">Waiting on Approval</option>
            <option value="waiting_on_customer">Waiting on Customer</option>
          </select>
          <div className="flex rounded-md border border-slate-200 overflow-hidden">
            <button onClick={() => setView("board")} className={cn("p-2", view === "board" ? "bg-slate-900 text-white" : "text-slate-400")}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setView("list")} className={cn("p-2", view === "list" ? "bg-slate-900 text-white" : "text-slate-400")}>
              <List className="w-4 h-4" />
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowArchive(!showArchive)}>
            {showArchive ? <ArchiveRestore className="w-4 h-4 mr-1" /> : <Archive className="w-4 h-4 mr-1" />}
            {showArchive ? "Active" : "Archive"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : view === "board" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGE_GROUPS.map(g => {
            const stageJobs = byStage[g.key] || [];
            if (showArchive && g.key !== "picked_up" && stageJobs.length === 0) return null;
            return (
              <div key={g.key} className="min-w-[280px] w-72 flex-shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</span>
                  <Badge className={cn("text-xs", g.color)}>{stageJobs.length}</Badge>
                </div>
                <div className="space-y-2">
                  {stageJobs.map(j => <JobCardMini key={j.id} job={j} customerName={customerName(j.customer_id)} platformLabel={platformLabel(j.platform_id)} />)}
                  {stageJobs.length === 0 && <p className="text-xs text-slate-300 text-center py-4">No jobs</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(j => (
            <JobRow key={j.id} job={j} customerName={customerName(j.customer_id)} platformLabel={platformLabel(j.platform_id)} />
          ))}
          {filtered.length === 0 && <p className="text-center text-slate-400 py-12">No jobs found</p>}
        </div>
      )}
    </div>
  );
}

function JobCardMini({ job, customerName, platformLabel }) {
  const parts = PARTS_LABELS[job.parts_readiness] || PARTS_LABELS.unknown;
  return (
    <Link to={`/JobCard?id=${job.id}`} className="block bg-white rounded-lg border border-slate-200 p-3 hover:border-[#e20404] hover:shadow-sm transition-all">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-xs text-[#e20404] font-semibold">{job.job_number}</span>
        <Badge className={cn("text-[10px] px-1.5", parts.cls)}>{parts.label}</Badge>
      </div>
      <p className="font-medium text-sm text-slate-900 truncate">{customerName}</p>
      <p className="text-xs text-slate-500 truncate">{platformLabel}</p>
      {job.storage_location && <p className="text-xs text-slate-400 mt-1">📍 {job.storage_location}</p>}
      {job.blocking_condition && job.blocking_condition !== "none" && (
        <div className="mt-2"><Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">{BLOCKING_LABELS[job.blocking_condition] || job.blocking_condition}</Badge></div>
      )}
    </Link>
  );
}

function JobRow({ job, customerName, platformLabel }) {
  const parts = PARTS_LABELS[job.parts_readiness] || PARTS_LABELS.unknown;
  const stageGroup = STAGE_GROUPS.find(g => g.key === job.stage);
  return (
    <Link to={`/JobCard?id=${job.id}`} className="flex items-center gap-4 bg-white rounded-lg border border-slate-200 p-3 hover:border-[#e20404] transition-all">
      <span className="font-mono text-xs text-[#e20404] font-semibold w-24">{job.job_number}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-slate-900 truncate">{customerName}</p>
        <p className="text-xs text-slate-500 truncate">{platformLabel} {job.storage_location ? `• 📍 ${job.storage_location}` : ""}</p>
      </div>
      {stageGroup && <Badge className={cn("text-xs", stageGroup.color)}>{stageGroup.label}</Badge>}
      {job.blocking_condition && job.blocking_condition !== "none" && (
        <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">{BLOCKING_LABELS[job.blocking_condition]}</Badge>
      )}
      <Badge className={cn("text-xs", parts.cls)}>{parts.label}</Badge>
      {job.is_warranty && <Badge variant="outline" className="text-xs text-purple-700 border-purple-300"><Wrench className="w-3 h-3 mr-1" />Warranty</Badge>}
    </Link>
  );
}