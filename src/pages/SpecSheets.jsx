import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Plus,
  Search,
  FileText,
  History,
  ChevronRight,
  ChevronDown,
  Copy,
  GitCompare,
  MoreVertical,
  Pencil,
  Trash2,
  CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const SPEC_TYPES = [
  { value: "stock", label: "Stock", color: "bg-slate-100 text-slate-700" },
  { value: "stage_1", label: "Stage 1", color: "bg-blue-100 text-blue-700" },
  { value: "stage_2", label: "Stage 2", color: "bg-purple-100 text-purple-700" },
  { value: "stage_3", label: "Stage 3", color: "bg-red-100 text-red-700" },
  { value: "contract", label: "Contract", color: "bg-emerald-100 text-emerald-700" },
  { value: "custom", label: "Custom", color: "bg-amber-100 text-amber-700" },
];

export default function SpecSheets() {
  const [search, setSearch] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [showVersions, setShowVersions] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState(null);
  const [newSpecData, setNewSpecData] = useState({
    platform_id: "",
    spec_type: "stock",
    custom_name: ""
  });
  const [duplicateData, setDuplicateData] = useState({
    platform_id: "",
    spec_type: "stock",
    custom_name: ""
  });
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const queryClient = useQueryClient();

  // Get platform from URL if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const platformId = params.get("platform");
    if (platformId) {
      setFilterPlatform(platformId);
    }
  }, []);

  const { data: specSheets = [], isLoading } = useQuery({
    queryKey: ["specSheets"],
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 500),
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.SpecSheet.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specSheets"] });
      setIsCreateDialogOpen(false);
      setNewSpecData({ platform_id: "", spec_type: "stock", custom_name: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SpecSheet.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specSheets"] });
    },
  });

  const filteredSpecs = specSheets.filter(spec => {
    const platform = platforms.find(p => p.id === spec.platform_id);
    const matchesSearch = search === "" ||
      platform?.name?.toLowerCase().includes(search.toLowerCase()) ||
      spec.custom_name?.toLowerCase().includes(search.toLowerCase());
    const matchesPlatform = filterPlatform === "all" || spec.platform_id === filterPlatform;
    const matchesType = filterType === "all" || spec.spec_type === filterType;
    const matchesVersion = showVersions || spec.is_current;
    return matchesSearch && matchesPlatform && matchesType && matchesVersion;
  });


  const getPlatformLabel = (p) => {
    if (!p) return "Unknown";
    let label = p.name;
    if (p.year_range_start || p.year_range_end) {
      label += ` (${p.year_range_start || "?"}–${p.year_range_end || "present"})`;
    }
    return label;
  };
  const getPlatformName = (id) => {
    const p = platforms.find(pl => pl.id === id);
    return getPlatformLabel(p);
  };
  const getSpecTypeConfig = (type) => SPEC_TYPES.find(t => t.value === type) || SPEC_TYPES[0];

  const handleCreateSpec = () => {
    createMutation.mutate({
      ...newSpecData,
      version: 1,
      is_current: true,
      status: "draft",
      specs: {}
    });
  };

  const handleOpenDuplicate = (spec) => {
    setDuplicateSource(spec);
    setDuplicateData({
      platform_id: spec.platform_id,
      spec_type: spec.spec_type,
      custom_name: spec.custom_name ? `${spec.custom_name} (Copy)` : ""
    });
    setIsDuplicateDialogOpen(true);
  };

  const handleDuplicateSpec = () => {
    createMutation.mutate({
      ...duplicateData,
      version: 1,
      is_current: true,
      status: "draft",
      specs: duplicateSource?.specs || {}
    });
    setIsDuplicateDialogOpen(false);
    setDuplicateSource(null);
  };

  const getSelectedPlatformYearRange = (platformId) => {
    const platform = platforms.find(p => p.id === platformId);
    if (platform && (platform.year_range_start || platform.year_range_end)) {
      return `${platform.year_range_start || "?"} - ${platform.year_range_end || "?"}`;
    }
    return null;
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Spec Sheets</h1>
          <p className="text-slate-500 mt-1">Engine specifications and stage configurations</p>
        </div>
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          className="bg-[#e20404] hover:bg-[#c00303] text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Spec Sheet
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search spec sheets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p.id} value={p.id}>{getPlatformLabel(p)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {SPEC_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showVersions ? "default" : "outline"}
          onClick={() => setShowVersions(!showVersions)}
          className="gap-2"
        >
          <History className="w-4 h-4" />
          {showVersions ? "Hide" : "Show"} History
        </Button>
      </div>

      {/* Specs grouped by Platform */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredSpecs.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-900">No spec sheets found</h3>
          <p className="text-slate-500 mt-1">
            {search || filterPlatform !== "all" || filterType !== "all"
              ? "Try adjusting your filters"
              : "Create your first specification sheet"}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(
            filteredSpecs.reduce((acc, spec) => {
              const key = spec.platform_id;
              (acc[key] = acc[key] || []).push(spec);
              return acc;
            }, {})
          ).map(([pid, specs]) => {
            const platform = platforms.find(p => p.id === pid);
            const yearStr = platform && (platform.year_range_start || platform.year_range_end)
              ? ` (${platform.year_range_start || "?"}–${platform.year_range_end || "present"})`
              : "";
            return (
              <div key={pid}>
                <button
                  onClick={() => setCollapsedGroups(prev => ({ ...prev, [pid]: !prev[pid] }))}
                  className="flex items-center gap-2 w-full text-left mb-3 group"
                >
                  {collapsedGroups[pid] ? (
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                  )}
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-600">
                    {platform?.name || "Unknown Platform"}{yearStr}
                    <span className="text-slate-300 font-normal ml-2">({specs.length})</span>
                  </h2>
                </button>
                {!collapsedGroups[pid] && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {specs.map((spec) => {
                    const typeConfig = getSpecTypeConfig(spec.spec_type);
                    const statusColor = spec.status === "active"
                      ? "bg-emerald-500"
                      : spec.status === "draft"
                      ? "bg-[#e20404]"
                      : "bg-slate-300";
                    return (
                      <Card key={spec.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
                                <Badge className={`text-xs ${typeConfig.color}`}>
                                  {typeConfig.label}
                                </Badge>
                                <span className="text-xs text-slate-400">v{spec.version}</span>
                              </div>
                              <p className="text-sm font-medium text-slate-700 mt-2 truncate">
                                {spec.custom_name || typeConfig.label}
                              </p>
                              {spec.notes && (
                                <p className="text-xs text-slate-400 line-clamp-1 mt-1">{spec.notes}</p>
                              )}
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link to={createPageUrl(`SpecView?id=${spec.id}`)}>
                                    <FileText className="w-4 h-4 mr-2" />
                                    View
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link to={createPageUrl(`SpecEditor?id=${spec.id}`)}>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Edit
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link to={createPageUrl(`SpecCompare?base=${spec.id}`)}>
                                    <GitCompare className="w-4 h-4 mr-2" />
                                    Compare
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleOpenDuplicate(spec)}>
                                  <Copy className="w-4 h-4 mr-2" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => deleteMutation.mutate(spec.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Spec Sheet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Engine Platform *</Label>
              <Select
                value={newSpecData.platform_id}
                onValueChange={(value) => setNewSpecData({ ...newSpecData, platform_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select platform..." />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.year_range_start && `(${p.year_range_start}-${p.year_range_end || "?"})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {newSpecData.platform_id && getSelectedPlatformYearRange(newSpecData.platform_id) && (
                <p className="text-xs text-slate-500">Year Range: {getSelectedPlatformYearRange(newSpecData.platform_id)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Specification Type *</Label>
              <Select
                value={newSpecData.spec_type}
                onValueChange={(value) => setNewSpecData({ ...newSpecData, spec_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPEC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(newSpecData.spec_type === "contract" || newSpecData.spec_type === "custom") && (
              <div className="space-y-2">
                <Label>Custom Name</Label>
                <Input
                  value={newSpecData.custom_name}
                  onChange={(e) => setNewSpecData({ ...newSpecData, custom_name: e.target.value })}
                  placeholder="e.g., Team XYZ Build Spec"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateSpec}
                className="bg-[#e20404] hover:bg-[#c00303] text-white"
                disabled={!newSpecData.platform_id || createMutation.isPending}
              >
                Create Spec Sheet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={isDuplicateDialogOpen} onOpenChange={setIsDuplicateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate Spec Sheet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Engine Platform *</Label>
              <Select
                value={duplicateData.platform_id}
                onValueChange={(value) => setDuplicateData({ ...duplicateData, platform_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select platform..." />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.year_range_start && `(${p.year_range_start}-${p.year_range_end || "?"})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Specification Type *</Label>
              <Select
                value={duplicateData.spec_type}
                onValueChange={(value) => setDuplicateData({ ...duplicateData, spec_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPEC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(duplicateData.spec_type === "contract" || duplicateData.spec_type === "custom") && (
              <div className="space-y-2">
                <Label>Custom Name</Label>
                <Input
                  value={duplicateData.custom_name}
                  onChange={(e) => setDuplicateData({ ...duplicateData, custom_name: e.target.value })}
                  placeholder="e.g., Team XYZ Build Spec"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setIsDuplicateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleDuplicateSpec}
                className="bg-[#e20404] hover:bg-[#c00303] text-white"
                disabled={!duplicateData.platform_id || createMutation.isPending}
              >
                Duplicate Spec Sheet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}