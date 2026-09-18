import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  MapPin,
  Plus,
  Trash2,
  Printer,
  Package,
  Wrench,
  ShoppingCart,
  Boxes,
  Save,
  CheckSquare,
  Square,
} from "lucide-react";
import { printStorageLocationLabel } from "@/components/engines/StorageLocationLabelPrint";

const CATEGORIES = [
  { key: "engines", label: "Engine Stands", icon: Wrench, placeholder: "e.g., ES1, ES2, Rack A-1" },
  { key: "carts", label: "Carts & Totes", icon: ShoppingCart, placeholder: "e.g., Cart 1, Tote 3" },
  { key: "stands", label: "Stands", icon: Boxes, placeholder: "e.g., Stand 1, Stand 2" },
  { key: "parts", label: "Parts Bins & Shelves", icon: Package, placeholder: "e.g., Bin 1, Shelf A" },
];

const DEFAULT_LOCATIONS = {
  engines: [],
  carts: [],
  stands: [],
  parts: [],
};

function parseLocations(jsonStr) {
  if (!jsonStr) return { ...DEFAULT_LOCATIONS };
  try {
    const parsed = JSON.parse(jsonStr);
    return { ...DEFAULT_LOCATIONS, ...parsed };
  } catch {
    return { ...DEFAULT_LOCATIONS };
  }
}

export default function StorageLocationsPanel() {
  const qc = useQueryClient();
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [newEntries, setNewEntries] = useState({ engines: "", carts: "", stands: "", parts: "" });
  const [printOpts, setPrintOpts] = useState({}); // { [`${cat}:${name}`]: { startPos, copies } }
  const [selected, setSelected] = useState({}); // { [`${cat}:${name}`]: true }
  const [bulkStartPos, setBulkStartPos] = useState(1);

  const { data: settingsData } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.filter({ key: "global" }),
  });

  useEffect(() => {
    if (settingsData?.[0]?.storage_locations) {
      setLocations(parseLocations(settingsData[0].storage_locations));
    }
  }, [settingsData]);

  const saveMutation = useMutation({
    mutationFn: async (locs) => {
      const json = JSON.stringify(locs);
      if (settingsData?.[0]) {
        return base44.entities.AppSettings.update(settingsData[0].id, { storage_locations: json });
      } else {
        return base44.entities.AppSettings.create({ key: "global", storage_locations: json });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Storage locations saved!");
    },
    onError: (e) => toast.error("Failed to save: " + (e?.message || "Unknown error")),
  });

  const addLocation = (cat) => {
    const name = (newEntries[cat] || "").trim();
    if (!name) return;
    if (locations[cat].some((l) => l.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists in ${CATEGORIES.find((c) => c.key === cat)?.label}`);
      return;
    }
    setLocations((prev) => ({ ...prev, [cat]: [...prev[cat], name] }));
    setNewEntries((prev) => ({ ...prev, [cat]: "" }));
  };

  const removeLocation = (cat, name) => {
    setLocations((prev) => ({ ...prev, [cat]: prev[cat].filter((l) => l !== name) }));
    setSelected((prev) => {
      const next = { ...prev };
      delete next[`${cat}:${name}`];
      return next;
    });
  };

  const handlePrint = (cat, name) => {
    const key = `${cat}:${name}`;
    const opts = printOpts[key] || { startPos: 1, copies: 1 };
    printStorageLocationLabel({ name, category: cat, startPos: opts.startPos, copies: opts.copies });
  };

  const setPrintOpt = (cat, name, field, value) => {
    const key = `${cat}:${name}`;
    setPrintOpts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { startPos: 1, copies: 1 }),
        [field]: value,
      },
    }));
  };

  const toggleSelected = (cat, name) => {
    const key = `${cat}:${name}`;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  };

  const toggleCategoryAll = (cat) => {
    const items = locations[cat] || [];
    const allSelected = items.every((n) => selected[`${cat}:${n}`]);
    setSelected((prev) => {
      const next = { ...prev };
      items.forEach((n) => {
        const key = `${cat}:${n}`;
        if (allSelected) delete next[key];
        else next[key] = true;
      });
      return next;
    });
  };

  const selectedCount = Object.keys(selected).length;

  const handleBulkPrint = () => {
    const entries = Object.keys(selected)
      .map((key) => {
        const [cat, ...nameParts] = key.split(":");
        return { name: nameParts.join(":"), category: cat };
      })
      .filter((e) => e.name);
    if (entries.length === 0) {
      toast.error("Select at least one location to print.");
      return;
    }
    if (entries.length > 10 - (bulkStartPos - 1)) {
      toast.warning(`Only ${10 - (bulkStartPos - 1)} labels fit on the sheet from slot ${bulkStartPos}. The first ${10 - (bulkStartPos - 1)} selected will print.`);
    }
    printStorageLocationLabel({ locations: entries, startPos: bulkStartPos });
  };

  const clearSelection = () => setSelected({});

  const hasChanges = (() => {
    const saved = parseLocations(settingsData?.[0]?.storage_locations);
    return JSON.stringify(saved) !== JSON.stringify(locations);
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#e20404]" /> Storage Locations
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Manage storage locations for engines, carts, stands, and parts. Select multiple locations and print them on a single label sheet.
          </p>
        </div>
        <Button
          className="bg-[#e20404] hover:bg-[#c00303] text-white"
          onClick={() => saveMutation.mutate(locations)}
          disabled={saveMutation.isPending || !hasChanges}
        >
          <Save className="w-4 h-4 mr-2" /> {saveMutation.isPending ? "Saving..." : "Save Locations"}
        </Button>
      </div>

      {/* Bulk print bar */}
      <div className="sticky top-12 z-10 flex items-center gap-3 flex-wrap p-3 rounded-lg bg-white border border-slate-200 shadow-sm">
        <span className="text-sm font-medium text-slate-700">
          {selectedCount > 0 ? `${selectedCount} selected` : "No locations selected"}
        </span>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs whitespace-nowrap text-slate-500">Starting slot</Label>
          <Input
            type="number"
            min="1"
            max="10"
            className="w-16 h-8 text-center text-sm"
            value={bulkStartPos}
            onChange={(e) => setBulkStartPos(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>
        <Button
          className="bg-[#e20404] hover:bg-[#c00303] text-white"
          onClick={handleBulkPrint}
          disabled={selectedCount === 0}
        >
          <Printer className="w-4 h-4 mr-2" /> Print Selected
        </Button>
        {selectedCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearSelection} className="text-slate-500">
            Clear
          </Button>
        )}
      </div>

      {CATEGORIES.map((cat) => {
        const Icon = cat.icon;
        const items = locations[cat.key] || [];
        const allSelected = items.length > 0 && items.every((n) => selected[`${cat.key}:${n}`]);
        const someSelected = items.some((n) => selected[`${cat.key}:${n}`]);
        return (
          <Card key={cat.key} className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Icon className="w-4 h-4 text-[#e20404]" /> {cat.label} ({items.length})
                {items.length > 0 && (
                  <button
                    onClick={() => toggleCategoryAll(cat.key)}
                    className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#e20404] transition-colors"
                  >
                    {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    {allSelected ? "Unselect all" : "Select all"}
                  </button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Add new */}
              <div className="flex gap-2">
                <Input
                  placeholder={cat.placeholder}
                  value={newEntries[cat.key] || ""}
                  onChange={(e) => setNewEntries((prev) => ({ ...prev, [cat.key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLocation(cat.key);
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => addLocation(cat.key)}
                  disabled={!(newEntries[cat.key] || "").trim()}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>

              {/* Existing locations */}
              {items.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No locations added yet.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((name) => {
                    const key = `${cat.key}:${name}`;
                    const opts = printOpts[key] || { startPos: 1, copies: 1 };
                    const isSelected = !!selected[key];
                    return (
                      <div
                        key={name}
                        className={`flex items-center gap-2 flex-wrap p-2.5 rounded-lg border transition-colors ${
                          isSelected ? "bg-red-50 border-[#e20404]/30" : "bg-slate-50 border-slate-100"
                        }`}
                      >
                        <button
                          onClick={() => toggleSelected(cat.key, name)}
                          className="flex-shrink-0 text-slate-400 hover:text-[#e20404] transition-colors"
                          title={isSelected ? "Unselect" : "Select for bulk print"}
                        >
                          {isSelected ? <CheckSquare className="w-5 h-5 text-[#e20404]" /> : <Square className="w-5 h-5" />}
                        </button>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="font-medium text-slate-800 truncate">{name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs whitespace-nowrap text-slate-400">Slot</Label>
                          <Input
                            type="number"
                            min="1"
                            max="10"
                            className="w-14 h-8 text-center text-xs"
                            value={opts.startPos}
                            onChange={(e) =>
                              setPrintOpt(cat.key, name, "startPos", Math.min(10, Math.max(1, Number(e.target.value) || 1)))
                            }
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs whitespace-nowrap text-slate-400">Copies</Label>
                          <Input
                            type="number"
                            min="1"
                            max="10"
                            className="w-14 h-8 text-center text-xs"
                            value={opts.copies}
                            onChange={(e) =>
                              setPrintOpt(cat.key, name, "copies", Math.min(10, Math.max(1, Number(e.target.value) || 1)))
                            }
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => handlePrint(cat.key, name)}
                        >
                          <Printer className="w-3.5 h-3.5 mr-1" /> Print
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => removeLocation(cat.key, name)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}