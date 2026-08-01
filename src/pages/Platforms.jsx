import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Layers,
  FileText,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

const CONFIGURATIONS = [
  { value: "inline-4", label: "Inline 4" },
  { value: "inline-3", label: "Inline 3" },
  { value: "v-twin", label: "V-Twin" },
  { value: "parallel-twin", label: "Parallel Twin" },
  { value: "single", label: "Single" },
];

const MANUFACTURERS = [
  "Suzuki",
  "Yamaha",
  "Honda",
  "Kawasaki",
];

export default function Platforms() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    manufacturer: "",
    year_range_start: "",
    year_range_end: "",
    displacement_cc: "",
    configuration: "",
    valve_count: "",
    cylinder_count: "",
    notes: "",
    status: "active"
  });

  const queryClient = useQueryClient();

  const { data: platforms = [], isLoading } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const { data: specSheets = [] } = useQuery({
    queryKey: ["specSheets"],
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 500),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.EnginePlatform.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platforms"] });
      closeDialog();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EnginePlatform.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platforms"] });
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EnginePlatform.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platforms"] });
    },
  });

  const openDialog = (platform = null) => {
    if (platform) {
      setEditingPlatform(platform);
      setFormData({
        name: platform.name || "",
        manufacturer: platform.manufacturer || "",
        year_range_start: platform.year_range_start || "",
        year_range_end: platform.year_range_end || "",
        displacement_cc: platform.displacement_cc || "",
        configuration: platform.configuration || "",
        valve_count: platform.valve_count || "",
        cylinder_count: platform.cylinder_count || "",
        notes: platform.notes || "",
        status: platform.status || "active"
      });
    } else {
      setEditingPlatform(null);
      setFormData({
        name: "",
        manufacturer: "",
        year_range_start: "",
        year_range_end: "",
        displacement_cc: "",
        configuration: "",
        valve_count: "",
        cylinder_count: "",
        notes: "",
        status: "active"
      });
    }
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingPlatform(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      year_range_start: formData.year_range_start ? Number(formData.year_range_start) : null,
      year_range_end: formData.year_range_end ? Number(formData.year_range_end) : null,
      displacement_cc: formData.displacement_cc ? Number(formData.displacement_cc) : null,
      cylinder_count: formData.cylinder_count ? Number(formData.cylinder_count) : null,
      valve_count: formData.valve_count ? Number(formData.valve_count) : null,
    };

    if (editingPlatform) {
      updateMutation.mutate({ id: editingPlatform.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const filteredPlatforms = platforms.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.manufacturer?.toLowerCase().includes(search.toLowerCase())
  );

  const getSpecCount = (platformId) => {
    return specSheets.filter(s => s.platform_id === platformId && s.is_current).length;
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Engine Platforms</h1>
          <p className="text-slate-500 mt-1">Manage engine platform configurations</p>
        </div>
        <Button onClick={() => openDialog()} className="bg-[#e20404] hover:bg-[#c00303] text-white">
          <Plus className="w-4 h-4 mr-2" />
          Add Platform
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search platforms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Grouped by Manufacturer */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredPlatforms.length === 0 ? (
        <div className="text-center py-16">
          <Layers className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-900">No platforms found</h3>
          <p className="text-slate-500 mt-1">
            {search ? "Try a different search term" : "Get started by adding an engine platform"}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(
            filteredPlatforms.reduce((acc, p) => {
              const mfr = p.manufacturer || "Other";
              (acc[mfr] = acc[mfr] || []).push(p);
              return acc;
            }, {})
          ).map(([mfr, platforms]) => (
            <div key={mfr}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
                {mfr} <span className="text-slate-300 font-normal">({platforms.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {platforms.map((platform) => {
                  const configLabel = CONFIGURATIONS.find(c => c.value === platform.configuration)?.label;
                  const yearStr = platform.year_range_start
                    ? `${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"}`
                    : "";
                  const specCount = getSpecCount(platform.id);

                  return (
                    <Card key={platform.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-slate-900 truncate">{platform.name}</h3>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 flex-wrap">
                              {platform.displacement_cc && <span>{platform.displacement_cc}cc</span>}
                              {platform.displacement_cc && configLabel && <span>•</span>}
                              {configLabel && <span>{configLabel}</span>}
                              {configLabel && yearStr && <span>•</span>}
                              {yearStr && <span>{yearStr}</span>}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openDialog(platform)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => deleteMutation.mutate(platform.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            {platform.cylinder_count && (
                              <Badge variant="outline" className="text-xs">
                                {platform.cylinder_count}cyl {platform.valve_count ? `/ ${platform.valve_count}v` : ""}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              <FileText className="w-3 h-3 mr-1" />
                              {specCount}
                            </Badge>
                          </div>
                          <Link
                            to={createPageUrl(`SpecSheets?platform=${platform.id}`)}
                            className="flex items-center text-xs text-[#e20404] hover:text-[#c00303] font-medium"
                          >
                            Specs <ChevronRight className="w-3 h-3 ml-0.5" />
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingPlatform ? "Edit Platform" : "Add Engine Platform"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Platform Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., GSX-R600, YZF-R6"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manufacturer">Manufacturer *</Label>
                <Input
                  id="manufacturer"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  placeholder="e.g., Suzuki, Yamaha"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year_start">Year Start</Label>
                <Input
                  id="year_start"
                  type="number"
                  value={formData.year_range_start}
                  onChange={(e) => setFormData({ ...formData, year_range_start: e.target.value })}
                  placeholder="1998"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year_end">Year End</Label>
                <Input
                  id="year_end"
                  type="number"
                  value={formData.year_range_end}
                  onChange={(e) => setFormData({ ...formData, year_range_end: e.target.value })}
                  placeholder="2015"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="displacement">Displacement (cc)</Label>
                <Input
                  id="displacement"
                  type="number"
                  value={formData.displacement_cc}
                  onChange={(e) => setFormData({ ...formData, displacement_cc: e.target.value })}
                  placeholder="600"
                />
              </div>
              <div className="space-y-2">
                <Label>Configuration</Label>
                <Select
                  value={formData.configuration}
                  onValueChange={(value) => setFormData({ ...formData, configuration: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CONFIGURATIONS.map((config) => (
                      <SelectItem key={config.value} value={config.value}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cylinder_count">Cylinders</Label>
                <Input
                  id="cylinder_count"
                  type="number"
                  value={formData.cylinder_count}
                  onChange={(e) => setFormData({ ...formData, cylinder_count: e.target.value })}
                  placeholder="4"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valve_count">Total Valves</Label>
                <Input
                  id="valve_count"
                  type="number"
                  value={formData.valve_count}
                  onChange={(e) => setFormData({ ...formData, valve_count: e.target.value })}
                  placeholder="16"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="General notes about this platform..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#e20404] hover:bg-[#c00303] text-white"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingPlatform ? "Save Changes" : "Add Platform"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}