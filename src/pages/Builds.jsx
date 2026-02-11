import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Plus,
  Search,
  Wrench,
  AlertCircle,
  ChevronRight,
  MoreVertical,
  Pencil,
  Trash2
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const STATUS_OPTIONS = [
  { value: "planning", label: "Planning", color: "bg-slate-100 text-slate-700" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-700" },
  { value: "assembly", label: "Assembly", color: "bg-[#e20404]/10 text-[#e20404]" },
  { value: "testing", label: "Testing", color: "bg-purple-100 text-purple-700" },
  { value: "complete", label: "Complete", color: "bg-emerald-100 text-emerald-700" },
  { value: "shipped", label: "Shipped", color: "bg-slate-100 text-slate-500" },
];

const SPEC_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "stage_1", label: "Stage 1" },
  { value: "stage_2", label: "Stage 2" },
  { value: "stage_3", label: "Stage 3" },
  { value: "contract", label: "Contract" },
  { value: "custom", label: "Custom" },
];

export default function Builds() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    build_number: "",
    platform_id: "",
    spec_sheet_id: "",
    customer_reference: "",
    target_power_hp: "",
    target_rpm_limit: "",
    application: "",
    assembly_notes: "",
    status: "planning"
  });

  const queryClient = useQueryClient();

  const { data: builds = [], isLoading } = useQuery({
    queryKey: ["builds"],
    queryFn: () => base44.entities.EngineBuild.list("-created_date", 500),
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const { data: specSheets = [] } = useQuery({
    queryKey: ["specSheets"],
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 500),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.EngineBuild.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["builds"] });
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EngineBuild.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["builds"] });
    },
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setFormData({
      build_number: "",
      platform_id: "",
      spec_sheet_id: "",
      customer_reference: "",
      target_power_hp: "",
      target_rpm_limit: "",
      application: "",
      assembly_notes: "",
      status: "planning"
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const selectedSpec = specSheets.find(s => s.id === formData.spec_sheet_id);
    createMutation.mutate({
      ...formData,
      target_power_hp: formData.target_power_hp ? Number(formData.target_power_hp) : null,
      target_rpm_limit: formData.target_rpm_limit ? Number(formData.target_rpm_limit) : null,
      spec_sheet_version: selectedSpec?.version || 1,
      start_date: new Date().toISOString().split("T")[0],
      overrides: []
    });
  };

  const filteredBuilds = builds.filter(build => {
    const platform = platforms.find(p => p.id === build.platform_id);
    const matchesSearch = search === "" ||
      build.build_number?.toLowerCase().includes(search.toLowerCase()) ||
      platform?.name?.toLowerCase().includes(search.toLowerCase()) ||
      build.application?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || build.status === filterStatus;
    const matchesPlatform = filterPlatform === "all" || build.platform_id === filterPlatform;
    return matchesSearch && matchesStatus && matchesPlatform;
  });

  const getPlatformName = (id) => platforms.find(p => p.id === id)?.name || "Unknown";
  const getSpecInfo = (id) => {
    const spec = specSheets.find(s => s.id === id);
    if (!spec) return null;
    return {
      ...spec,
      label: spec.custom_name || SPEC_TYPES.find(t => t.value === spec.spec_type)?.label || spec.spec_type
    };
  };
  const getStatusConfig = (status) => STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];

  const availableSpecs = specSheets.filter(s =>
    s.is_current && (!formData.platform_id || s.platform_id === formData.platform_id)
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Engine Builds</h1>
          <p className="text-slate-500 mt-1">Track and manage individual engine builds</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="bg-[#e20404] hover:bg-[#c00303] text-white">
          <Plus className="w-4 h-4 mr-2" />
          New Build
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search builds..."
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
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Builds Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredBuilds.length === 0 ? (
        <div className="text-center py-16">
          <Wrench className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-900">No builds found</h3>
          <p className="text-slate-500 mt-1">
            {search || filterStatus !== "all" || filterPlatform !== "all"
              ? "Try adjusting your filters"
              : "Start your first engine build"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBuilds.map((build) => {
            const statusConfig = getStatusConfig(build.status);
            const specInfo = getSpecInfo(build.spec_sheet_id);
            return (
              <Card key={build.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{build.build_number}</h3>
                      <p className="text-sm text-slate-500">{getPlatformName(build.platform_id)}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={createPageUrl(`BuildDetail?id=${build.id}`)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            View / Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteMutation.mutate(build.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
                    {specInfo && (
                      <Badge variant="outline">{specInfo.label} v{specInfo.version}</Badge>
                    )}
                    {build.overrides?.length > 0 && (
                      <Badge className="bg-[#e20404]/10 text-[#e20404] gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {build.overrides.length} Override{build.overrides.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>

                  {build.application && (
                    <p className="text-sm text-slate-600 mb-2">{build.application}</p>
                  )}

                  {(build.target_power_hp || build.target_rpm_limit) && (
                    <p className="text-xs text-slate-500 mb-3">
                      {build.target_power_hp && `${build.target_power_hp} HP`}
                      {build.target_power_hp && build.target_rpm_limit && " • "}
                      {build.target_rpm_limit && `${build.target_rpm_limit} RPM`}
                    </p>
                  )}

                  <Link
                    to={createPageUrl(`BuildDetail?id=${build.id}`)}
                    className="flex items-center text-sm text-[#e20404] hover:text-[#c00303] font-medium"
                  >
                    View Build Details
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Engine Build</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="build_number">Build Number *</Label>
                <Input
                  id="build_number"
                  value={formData.build_number}
                  onChange={(e) => setFormData({ ...formData, build_number: e.target.value })}
                  placeholder="e.g., LS3-2024-001"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Platform *</Label>
                <Select
                  value={formData.platform_id}
                  onValueChange={(value) => setFormData({ ...formData, platform_id: value, spec_sheet_id: "" })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Spec Sheet</Label>
              <Select
                value={formData.spec_sheet_id}
                onValueChange={(value) => setFormData({ ...formData, spec_sheet_id: value })}
                disabled={!formData.platform_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select spec sheet..." />
                </SelectTrigger>
                <SelectContent>
                  {availableSpecs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.custom_name || SPEC_TYPES.find(t => t.value === s.spec_type)?.label} (v{s.version})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="target_power">Target HP</Label>
                <Input
                  id="target_power"
                  type="number"
                  value={formData.target_power_hp}
                  onChange={(e) => setFormData({ ...formData, target_power_hp: e.target.value })}
                  placeholder="650"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target_rpm">Target RPM</Label>
                <Input
                  id="target_rpm"
                  type="number"
                  value={formData.target_rpm_limit}
                  onChange={(e) => setFormData({ ...formData, target_rpm_limit: e.target.value })}
                  placeholder="7500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="application">Application</Label>
              <Input
                id="application"
                value={formData.application}
                onChange={(e) => setFormData({ ...formData, application: e.target.value })}
                placeholder="e.g., 2024 Camaro Track Car"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer_ref">Customer Reference</Label>
              <Input
                id="customer_ref"
                value={formData.customer_reference}
                onChange={(e) => setFormData({ ...formData, customer_reference: e.target.value })}
                placeholder="Internal reference"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Assembly Notes</Label>
              <Textarea
                id="notes"
                value={formData.assembly_notes}
                onChange={(e) => setFormData({ ...formData, assembly_notes: e.target.value })}
                placeholder="Initial notes..."
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#e20404] hover:bg-[#c00303] text-white"
                disabled={createMutation.isPending || !formData.build_number || !formData.platform_id}
              >
                Create Build
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}