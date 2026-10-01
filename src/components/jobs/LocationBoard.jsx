import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import JobBoardCard from "@/components/jobs/JobBoardCard";

// Location board — a physical-relocation view. Cards are grouped by storage
// location (from AppSettings.storage_locations + any locations in use on jobs).
// Dragging between columns updates job.storage_location and appends to
// location_history for traceability. Unlike the stage board, moves here do
// NOT change the workflow stage — location and stage are decoupled.
export default function LocationBoard({
  jobs,
  customerName,
  platformLabel,
  engineObj,
  onNavigate,
  onRelocate,
}) {
  const [newLocation, setNewLocation] = useState("");
  const [adding, setAdding] = useState(false);

  // Load storage location config from AppSettings
  const { data: settingsList = [] } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const res = await base44.entities.AppSettings.filter({ key: "global" });
      return res.items || res || [];
    },
  });

  const settings = Array.isArray(settingsList) ? settingsList[0] : settingsList;

  // Parse configured locations from the JSON string
  const configuredLocations = useMemo(() => {
    if (!settings?.storage_locations) return [];
    try {
      const parsed = JSON.parse(settings.storage_locations);
      const flat = Object.values(parsed).flat().filter(Boolean);
      return flat;
    } catch {
      return [];
    }
  }, [settings]);

  // Merge configured locations with any locations already in use on jobs
  const allLocations = useMemo(() => {
    const set = new Set(configuredLocations);
    for (const job of jobs) {
      if (job.storage_location) set.add(job.storage_location);
    }
    return Array.from(set);
  }, [configuredLocations, jobs]);

  // Group jobs by location
  const columns = useMemo(() => {
    const map = {};
    for (const loc of allLocations) map[loc] = [];
    map["Unassigned"] = [];
    for (const job of jobs) {
      const loc = job.storage_location || "Unassigned";
      if (!map[loc]) map[loc] = [];
      map[loc].push(job);
    }
    return map;
  }, [jobs, allLocations]);

  const handleDragEnd = useCallback(async (result) => {
    if (!result.destination) return;
    const job = jobs.find((j) => j.id === result.draggableId);
    const newLoc = result.destination.droppableId;
    if (!job || job.storage_location === newLoc) return;
    await onRelocate(job, newLoc);
  }, [jobs, onRelocate]);

  const handleAddLocation = useCallback(async () => {
    const name = newLocation.trim();
    if (!name) return;
    if (allLocations.includes(name)) {
      toast.error("That location already exists.");
      return;
    }
    // Persist to AppSettings.storage_locations under the "engines" category
    try {
      const current = settings?.storage_locations ? JSON.parse(settings.storage_locations) : {};
      const engines = current.engines || [];
      if (!engines.includes(name)) engines.push(name);
      current.engines = engines;
      await base44.entities.AppSettings.update(settings.id, {
        storage_locations: JSON.stringify(current),
      });
      toast.success(`Location "${name}" added.`);
      setNewLocation("");
      setAdding(false);
    } catch (e) {
      toast.error("Failed to add location: " + (e.message || e));
    }
  }, [settings, allLocations, newLocation]);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Object.entries(columns).map(([loc, locJobs]) => (
          <div key={loc} className="min-w-[240px] w-60 flex-shrink-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1">
                {loc === "Unassigned" ? (
                  <span className="text-slate-400">Unassigned</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    {loc}
                  </span>
                )}
              </span>
              <Badge className="text-xs bg-slate-100 text-slate-600">{locJobs.length}</Badge>
            </div>
            <Droppable droppableId={loc}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    "space-y-2 min-h-[80px] rounded-lg p-1 transition-colors",
                    snapshot.isDraggingOver && "bg-blue-50"
                  )}
                >
                  {locJobs.map((j, idx) => (
                    <Draggable key={j.id} draggableId={j.id} index={idx}>
                      {(prov, snap) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}
                          className={cn(snap.isDragging && "shadow-lg ring-2 ring-blue-300/40")}
                        >
                          <JobBoardCard
                            job={j}
                            customerName={customerName(j.customer_id)}
                            platformLabel={platformLabel(j.platform_id)}
                            engine={engineObj(j.customer_engine_id)}
                            onClick={() => onNavigate(j.id)}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {locJobs.length === 0 && (
                    <p className="text-xs text-slate-300 text-center py-4">Empty</p>
                  )}
                </div>
              )}
            </Droppable>
          </div>
        ))}

        {/* Add new location column */}
        <div className="min-w-[200px] w-52 flex-shrink-0">
          {adding ? (
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-3">
              <input
                autoFocus
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddLocation(); if (e.key === "Escape") { setAdding(false); setNewLocation(""); } }}
                placeholder="Location name..."
                className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 mb-2"
              />
              <div className="flex gap-1">
                <button onClick={handleAddLocation} className="text-xs bg-[#e20404] text-white rounded px-2 py-1">Add</button>
                <button onClick={() => { setAdding(false); setNewLocation(""); }} className="text-xs text-slate-400 rounded px-2 py-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full border-2 border-dashed border-slate-200 rounded-lg p-4 text-sm text-slate-400 hover:border-slate-300 hover:text-slate-500 flex flex-col items-center gap-1"
            >
              <Plus className="w-5 h-5" />
              <span>Add Location</span>
            </button>
          )}
        </div>
      </div>
    </DragDropContext>
  );
}