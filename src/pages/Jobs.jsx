import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Search, LayoutGrid, List, Archive, ArchiveRestore, ChevronDown, Check, RotateCcw, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import JobBoardCard from "@/components/jobs/JobBoardCard";
import IntakeLinkDialog from "@/components/jobs/IntakeLinkDialog";
import IntakeEngineDialog from "@/components/jobs/IntakeEngineDialog";
import PickupShippingCheckDialog from "@/components/jobs/PickupShippingCheckDialog";
import { moveJobStage, getIntakeAction } from "@/lib/jobMoveHelpers";

// --- View definitions ---
// Views change which columns are shown. Jobs can appear in multiple views.
const VIEWS = {
  intake: {
    label: "Intake Queue",
    columns: [
      { key: "needs_estimate", label: "Checked In — Needs Estimate", filter: j => j.customer_engine_id && (!j.estimate_id || j.stage === "awaiting_approval") && !j.archived },
      { key: "awaiting_approval", label: "Awaiting Approval", filter: j => j.stage === "awaiting_approval" && !j.archived },
      { key: "awaiting_engine", label: "Approved — Awaiting Engine", filter: j => j.is_engine_build && j.estimate_id && !j.customer_engine_id && !j.archived && j.stage !== "awaiting_approval" },
      { key: "awaiting_deposit", label: "Awaiting Deposit", filter: j => j.stage === "awaiting_deposit" && !j.archived },
    ],
  },
  active: {
    label: "Active Shop",
    columns: [
      { key: "queued", label: "Queued", filter: j => j.stage === "queued" && !j.archived },
      { key: "teardown", label: "Teardown / Inspection", filter: j => j.stage === "teardown" && !j.archived },
      { key: "machining", label: "Machining", filter: j => j.stage === "machining" && !j.archived },
      { key: "assembly", label: "Assembly", filter: j => j.stage === "assembly" && !j.archived },
      { key: "testing", label: "Testing", filter: j => j.stage === "testing" && !j.archived },
    ],
  },
  ready: {
    label: "Ready & Completed",
    columns: [
      { key: "ready_for_pickup", label: "Ready for Pickup", filter: j => j.stage === "ready_for_pickup" && !j.archived },
      { key: "picked_up", label: "Picked Up / Shipped", filter: j => j.stage === "picked_up" },
    ],
  },
  all: {
    label: "All Stages",
    columns: [
      { key: "awaiting_approval", label: "Awaiting Approval", filter: j => j.stage === "awaiting_approval" && !j.archived },
      { key: "awaiting_deposit", label: "Awaiting Deposit", filter: j => j.stage === "awaiting_deposit" && !j.archived },
      { key: "queued", label: "Queued", filter: j => j.stage === "queued" && !j.archived },
      { key: "teardown", label: "Teardown / Inspection", filter: j => j.stage === "teardown" && !j.archived },
      { key: "machining", label: "Machining", filter: j => j.stage === "machining" && !j.archived },
      { key: "assembly", label: "Assembly", filter: j => j.stage === "assembly" && !j.archived },
      { key: "testing", label: "Testing", filter: j => j.stage === "testing" && !j.archived },
      { key: "ready_for_pickup", label: "Ready for Pickup", filter: j => j.stage === "ready_for_pickup" && !j.archived },
      { key: "picked_up", label: "Picked Up / Shipped", filter: j => j.stage === "picked_up" },
    ],
  },
};

// Map view column keys to actual job stage values for drop targets
const COLUMN_TO_STAGE = {
  needs_estimate: null, // intake column — no stage change
  awaiting_engine: null,
  awaiting_approval: "awaiting_approval",
  awaiting_deposit: "awaiting_deposit",
  queued: "queued",
  teardown: "teardown",
  machining: "machining",
  assembly: "assembly",
  testing: "testing",
  ready_for_pickup: "ready_for_pickup",
  picked_up: "picked_up",
};

const COLUMN_COLORS = {
  needs_estimate: "bg-slate-100 text-slate-600",
  awaiting_approval: "bg-slate-100 text-slate-600",
  awaiting_engine: "bg-blue-100 text-blue-700",
  awaiting_deposit: "bg-amber-100 text-amber-700",
  queued: "bg-blue-100 text-blue-700",
  teardown: "bg-indigo-100 text-indigo-700",
  machining: "bg-purple-100 text-purple-700",
  assembly: "bg-violet-100 text-violet-700",
  testing: "bg-cyan-100 text-cyan-700",
  ready_for_pickup: "bg-emerald-100 text-emerald-700",
  picked_up: "bg-slate-200 text-slate-600",
};

const ACTIVE_STAGES = [
  { key: "queued", label: "Queued" },
  { key: "teardown", label: "Teardown / Inspection" },
  { key: "machining", label: "Machining" },
  { key: "assembly", label: "Assembly" },
  { key: "testing", label: "Testing" },
  { key: "ready_for_pickup", label: "Ready for Pickup" },
  { key: "picked_up", label: "Picked Up / Shipped" },
];

export default function Jobs() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [view, setView] = useState("board");
  const [activeView, setActiveView] = useState("all");
  const [showArchive, setShowArchive] = useState(false);
  const [movingId, setMovingId] = useState(null);
  const [intakeDialog, setIntakeDialog] = useState(null); // { type: "estimate"|"engine", job, customer }
  const [pickupDialog, setPickupDialog] = useState(null); // job

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", showArchive],
    queryFn: async () => {
      const res = await base44.entities.Job.filter({ archived: showArchive }, "-created_date", 500);
      return res.items || res || [];
    },
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const res = await base44.entities.Customer.list("-created_date", 200);
      return res.items || res || [];
    },
  });
  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: async () => {
      const res = await base44.entities.EnginePlatform.list("-created_date", 100);
      return res.items || res || [];
    },
  });
  const { data: engines = [] } = useQuery({
    queryKey: ["all-engines-jobs"],
    queryFn: async () => {
      const res = await base44.entities.CustomerEngine.list("-created_date", 1000);
      return res.items || res || [];
    },
  });
  const { data: builds = [] } = useQuery({
    queryKey: ["builds-for-jobs"],
    queryFn: async () => {
      const res = await base44.entities.EngineBuild.list("-created_date", 500);
      return res.items || res || [];
    },
  });

  const customerName = (id) => {
    const c = customers.find(c => c.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "";
  };
  const customerObj = (id) => customers.find(c => c.id === id);
  const platformLabel = (id) => {
    const p = platforms.find(p => p.id === id);
    return p ? `${p.manufacturer} ${p.name}` : "";
  };
  const engineObj = (id) => engines.find(e => e.id === id);
  const buildObj = (id) => builds.find(b => b.id === id);

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      if (!search) return true;
      const q = search.toLowerCase();
      const cn = customerName(j.customer_id).toLowerCase();
      return (j.job_number || "").toLowerCase().includes(q) || cn.includes(q) || (j.storage_location || "").toLowerCase().includes(q);
    });
  }, [jobs, search, customers]);

  const viewConfig = VIEWS[activeView];
  const columns = useMemo(() => {
    const map = {};
    for (const col of viewConfig.columns) {
      map[col.key] = filtered.filter(col.filter);
    }
    return map;
  }, [filtered, viewConfig]);

  const invalidateAll = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["jobs"] });
    await qc.invalidateQueries({ queryKey: ["builds-for-jobs"] });
    await qc.invalidateQueries({ queryKey: ["all-engines-jobs"] });
  }, [qc]);

  // Central drop handler — validates, shows intake dialogs, or commits the move
  const handleDragEnd = useCallback(async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination || source.droppableId === destination.droppableId) return;

    const job = jobs.find(j => j.id === draggableId);
    if (!job) return;

    const targetColumnKey = destination.droppableId;
    const targetStage = COLUMN_TO_STAGE[targetColumnKey];

    // Intake columns (needs_estimate, awaiting_engine) — open dialogs, don't move
    if (targetColumnKey === "needs_estimate") {
      if (job.customer_engine_id && !job.estimate_id) {
        setIntakeDialog({ type: "estimate", job, customer: customerObj(job.customer_id) });
      }
      return; // don't move — card returns to original position
    }
    if (targetColumnKey === "awaiting_engine") {
      if (job.estimate_id && !job.customer_engine_id && job.is_engine_build) {
        setIntakeDialog({ type: "engine", job, customer: customerObj(job.customer_id) });
      }
      return;
    }

    if (!targetStage) return;

    // Check for intake requirements before entering active stages
    const intakeAction = getIntakeAction(job, targetStage);
    if (intakeAction?.dialog === "intake_estimate") {
      setIntakeDialog({ type: "estimate", job, customer: customerObj(job.customer_id) });
      return;
    }
    if (intakeAction?.dialog === "intake_engine") {
      setIntakeDialog({ type: "engine", job, customer: customerObj(job.customer_id) });
      return;
    }
    if (intakeAction?.blocked) {
      toast.error(intakeAction.message);
      return;
    }

    // Commit the move
    setMovingId(job.id);
    try {
      const build = buildObj(job.build_id);
      const res = await moveJobStage(job, targetStage, build);
      if (res?.needsDialog === "pickup") {
        setPickupDialog(job);
      }
      await invalidateAll();
    } finally {
      setMovingId(null);
    }
  }, [jobs, builds, customers, qc, invalidateAll]);

  // Move dropdown (mobile/keyboard equivalent of drag-and-drop)
  const handleMoveFromDropdown = useCallback(async (job, newStage) => {
    const intakeAction = getIntakeAction(job, newStage);
    if (intakeAction?.dialog === "intake_estimate") {
      setIntakeDialog({ type: "estimate", job, customer: customerObj(job.customer_id) });
      return;
    }
    if (intakeAction?.dialog === "intake_engine") {
      setIntakeDialog({ type: "engine", job, customer: customerObj(job.customer_id) });
      return;
    }
    if (intakeAction?.blocked) {
      toast.error(intakeAction.message);
      return;
    }

    setMovingId(job.id);
    try {
      const build = buildObj(job.build_id);
      const res = await moveJobStage(job, newStage, build);
      if (res?.needsDialog === "pickup") {
        setPickupDialog(job);
      }
      await invalidateAll();
    } finally {
      setMovingId(null);
    }
  }, [jobs, builds, customers, qc, invalidateAll]);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
          <p className="text-slate-500 text-sm mt-1">Unified workspace — intake through pickup</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search jobs, customers..."
              className="pl-9 w-48 md:w-64"
            />
          </div>
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

      {/* View selector tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto scrollbar-hide">
        {Object.entries(VIEWS).map(([key, v]) => (
          <button
            key={key}
            onClick={() => setActiveView(key)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeView === key
                ? "border-[#e20404] text-[#e20404]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : view === "board" ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {viewConfig.columns.map(col => {
              const colJobs = columns[col.key] || [];
              return (
                <div key={col.key} className="min-w-[260px] w-64 flex-shrink-0">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{col.label}</span>
                    <Badge className={cn("text-xs", COLUMN_COLORS[col.key] || "bg-slate-100 text-slate-600")}>{colJobs.length}</Badge>
                  </div>
                  <Droppable droppableId={col.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          "space-y-2 min-h-[60px] rounded-lg p-1 transition-colors",
                          snapshot.isDraggingOver && "bg-slate-100"
                        )}
                      >
                        {colJobs.map((j, idx) => (
                          <Draggable key={j.id} draggableId={j.id} index={idx}>
                            {(prov, snap) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                className={cn(snap.isDragging && "shadow-lg ring-2 ring-[#e20404]/30")}
                              >
                                <div className="relative group">
                                  <JobBoardCard
                                    job={j}
                                    customerName={customerName(j.customer_id)}
                                    platformLabel={platformLabel(j.platform_id)}
                                    engine={engineObj(j.customer_engine_id)}
                                    onClick={() => navigate(`/JobCard?id=${j.id}`)}
                                  />
                                  {/* Move dropdown — mobile/keyboard equivalent */}
                                  <MoveDropdown
                                    job={j}
                                    onMove={(stage) => handleMoveFromDropdown(j, stage)}
                                    disabled={movingId === j.id}
                                  />
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {colJobs.length === 0 && <p className="text-xs text-slate-300 text-center py-4">No jobs</p>}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      ) : (
        <div className="space-y-2">
          {filtered.map(j => (
            <JobRow
              key={j.id}
              job={j}
              customerName={customerName(j.customer_id)}
              platformLabel={platformLabel(j.platform_id)}
              engine={engineObj(j.customer_engine_id)}
              onMove={(stage) => handleMoveFromDropdown(j, stage)}
            />
          ))}
          {filtered.length === 0 && <p className="text-center text-slate-400 py-12">No jobs found</p>}
        </div>
      )}

      {/* Intake dialogs */}
      {intakeDialog?.type === "estimate" && (
        <IntakeLinkDialog
          job={intakeDialog.job}
          customer={intakeDialog.customer}
          open={true}
          onClose={() => setIntakeDialog(null)}
          onLinked={() => invalidateAll()}
        />
      )}
      {intakeDialog?.type === "engine" && (
        <IntakeEngineDialog
          job={intakeDialog.job}
          customer={intakeDialog.customer}
          open={true}
          onClose={() => setIntakeDialog(null)}
          onLinked={() => invalidateAll()}
        />
      )}
      {/* Pickup/shipping check dialog */}
      {pickupDialog && (
        <PickupShippingCheckDialog
          job={pickupDialog}
          open={true}
          onClose={() => setPickupDialog(null)}
          onFinalized={() => { setPickupDialog(null); invalidateAll(); }}
        />
      )}
    </div>
  );
}

// Move dropdown — appears on hover (desktop) and always accessible on mobile
function MoveDropdown({ job, onMove, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          disabled={disabled}
          className="bg-white border border-slate-200 rounded p-1 shadow-sm hover:bg-slate-50"
        >
          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
            <div className="absolute right-0 top-7 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-48">
              <p className="px-3 py-1 text-[10px] font-semibold uppercase text-slate-400">Move to stage</p>
              {ACTIVE_STAGES.map(s => (
                <button
                  key={s.key}
                  onClick={(e) => { e.stopPropagation(); setOpen(false); onMove(s.key); }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center justify-between",
                    s.key === job.stage && "font-semibold text-[#e20404]"
                  )}
                >
                  <span>{s.label}</span>
                  {s.key === job.stage && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function JobRow({ job, customerName, platformLabel, engine, onMove }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const parts = job.parts_readiness || "unknown";
  const partsCls = {
    ready: "bg-emerald-100 text-emerald-700",
    partially_supplied: "bg-amber-100 text-amber-700",
    waiting_on_parts: "bg-red-100 text-red-700",
    unknown: "bg-slate-100 text-slate-400",
  }[parts] || "bg-slate-100 text-slate-400";
  const partsLabel = {
    ready: "Parts Ready", partially_supplied: "Partial", waiting_on_parts: "W/O Parts", unknown: "—",
  }[parts] || "—";

  return (
    <Link to={`/JobCard?id=${job.id}`} className="flex items-center gap-4 bg-white rounded-lg border border-slate-200 p-3 hover:border-[#e20404] transition-all">
      <span className="font-mono text-xs text-[#e20404] font-semibold w-24">{job.job_number}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-slate-900 truncate">{customerName}</p>
        <p className="text-xs text-slate-500 truncate">
          {platformLabel}
          {engine?.eed_id && ` · ${engine.eed_id}`}
          {job.storage_location ? ` · 📍 ${job.storage_location}` : ""}
        </p>
      </div>
      <Badge className={cn("text-xs", partsCls)}>{partsLabel}</Badge>
      {(job.secondary_tags || []).map(tag => (
        <Badge key={tag} variant="outline" className="text-xs text-amber-700 border-amber-300 flex items-center gap-0.5">
          <Tag className="w-2.5 h-2.5" />
          {tag === "waiting_on_parts" ? "W/O Parts" : tag === "waiting_on_approval" ? "W/O Approval" : tag === "awaiting_deposit" ? "Awaiting $" : tag === "on_hold" ? "On Hold" : tag}
        </Badge>
      ))}
    </Link>
  );
}