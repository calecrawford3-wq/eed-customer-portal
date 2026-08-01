import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import DocumentUploadDialog from "@/components/documents/DocumentUploadDialog";
import DocumentsGrid from "@/components/documents/DocumentsGrid";

const DOCUMENT_TYPES = [
  { value: "oem_manual", label: "OEM Manual" },
  { value: "torque_chart", label: "Torque Chart" },
  { value: "diagram", label: "Diagram" },
  { value: "wiring_schematic", label: "Wiring Schematic" },
  { value: "parts_list", label: "Parts List" },
  { value: "technical_bulletin", label: "Technical Bulletin" },
  { value: "internal_procedure", label: "Internal Procedure" },
  { value: "other", label: "Other" },
];

const SUBSYSTEMS = [
  { value: "block", label: "Block" },
  { value: "rotating_assembly", label: "Rotating Assembly" },
  { value: "cylinder_head", label: "Cylinder Head" },
  { value: "valvetrain", label: "Valvetrain" },
  { value: "timing", label: "Timing" },
  { value: "oiling", label: "Oiling" },
  { value: "cooling", label: "Cooling" },
  { value: "fuel", label: "Fuel" },
  { value: "ignition", label: "Ignition" },
  { value: "intake", label: "Intake" },
  { value: "exhaust", label: "Exhaust" },
  { value: "sensors", label: "Sensors" },
  { value: "general", label: "General" },
];

export default function Documents() {
  const [search, setSearch] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterSubsystem, setFilterSubsystem] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => base44.entities.TechnicalDocument.list("-created_date", 500),
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TechnicalDocument.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document uploaded");
    },
    onError: () => toast.error("Failed to upload document"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TechnicalDocument.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document deleted");
    },
  });

  const handleCreate = (data, closeDialog) => {
    createMutation.mutate(data, { onSuccess: closeDialog });
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      search === "" ||
      doc.title?.toLowerCase().includes(search.toLowerCase()) ||
      doc.description?.toLowerCase().includes(search.toLowerCase()) ||
      doc.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesPlatform = filterPlatform === "all" || doc.platform_id === filterPlatform;
    const matchesType = filterType === "all" || doc.document_type === filterType;
    const matchesSubsystem = filterSubsystem === "all" || doc.subsystem === filterSubsystem;
    return matchesSearch && matchesPlatform && matchesType && matchesSubsystem;
  });

  const hasActiveFilters =
    search !== "" ||
    filterPlatform !== "all" ||
    filterType !== "all" ||
    filterSubsystem !== "all";

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Technical Documents</h1>
          <p className="text-slate-500 mt-1">Manuals, diagrams, torque charts, and reference files</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="bg-[#e20404] hover:bg-[#c00303] text-white">
          <Plus className="w-4 h-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search documents..."
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
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {DOCUMENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSubsystem} onValueChange={setFilterSubsystem}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Subsystems" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subsystems</SelectItem>
            {SUBSYSTEMS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Documents Grid */}
      <DocumentsGrid
        documents={filteredDocuments}
        isLoading={isLoading}
        platforms={platforms}
        onDelete={(id) => deleteMutation.mutate(id)}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Upload Dialog */}
      <DocumentUploadDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        platforms={platforms}
        onCreate={handleCreate}
      />
    </div>
  );
}