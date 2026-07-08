import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Filter,
  FileText,
  Upload,
  ExternalLink,
  Trash2,
  FolderOpen,
  X
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    platform_id: "",
    document_type: "",
    subsystem: "",
    file_url: "",
    file_name: "",
    year_applicable_start: "",
    year_applicable_end: "",
    description: "",
    tags: []
  });
  const [tagInput, setTagInput] = useState("");

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
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TechnicalDocument.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFormData({ ...formData, file_url, file_name: file.name });
    setUploading(false);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setFormData({
      title: "",
      platform_id: "",
      document_type: "",
      subsystem: "",
      file_url: "",
      file_name: "",
      year_applicable_start: "",
      year_applicable_end: "",
      description: "",
      tags: []
    });
    setTagInput("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      year_applicable_start: formData.year_applicable_start ? Number(formData.year_applicable_start) : null,
      year_applicable_end: formData.year_applicable_end ? Number(formData.year_applicable_end) : null,
    };
    createMutation.mutate(data);
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, tagInput.trim()] });
      setTagInput("");
    }
  };

  const removeTag = (tag) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = search === "" || 
      doc.title?.toLowerCase().includes(search.toLowerCase()) ||
      doc.description?.toLowerCase().includes(search.toLowerCase()) ||
      doc.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchesPlatform = filterPlatform === "all" || doc.platform_id === filterPlatform;
    const matchesType = filterType === "all" || doc.document_type === filterType;
    const matchesSubsystem = filterSubsystem === "all" || doc.subsystem === filterSubsystem;
    return matchesSearch && matchesPlatform && matchesType && matchesSubsystem;
  });

  const getPlatformName = (id) => platforms.find(p => p.id === id)?.name || "Unknown";
  
  const getSelectedPlatformYearRange = (platformId) => {
    const platform = platforms.find(p => p.id === platformId);
    if (platform && (platform.year_range_start || platform.year_range_end)) {
      return `${platform.year_range_start || "?"} - ${platform.year_range_end || "?"}`;
    }
    return null;
  };

  const typeColors = {
    oem_manual: "bg-blue-100 text-blue-700",
    torque_chart: "bg-emerald-100 text-emerald-700",
    diagram: "bg-purple-100 text-purple-700",
    wiring_schematic: "bg-orange-100 text-orange-700",
    parts_list: "bg-slate-100 text-slate-700",
    technical_bulletin: "bg-red-100 text-red-700",
    internal_procedure: "bg-[#e20404]/10 text-[#e20404]",
    other: "bg-slate-100 text-slate-600"
  };

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
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-900">No documents found</h3>
          <p className="text-slate-500 mt-1">
            {search || filterPlatform !== "all" || filterType !== "all" || filterSubsystem !== "all"
              ? "Try adjusting your filters"
              : "Upload your first technical document"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => (
            <Card key={doc.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-100 p-2 rounded-lg">
                      <FileText className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-slate-900 line-clamp-1">{doc.title}</h3>
                      <p className="text-xs text-slate-500">{getPlatformName(doc.platform_id)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-red-500"
                    onClick={() => deleteMutation.mutate(doc.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <Badge className={typeColors[doc.document_type] || typeColors.other}>
                    {DOCUMENT_TYPES.find(t => t.value === doc.document_type)?.label || doc.document_type}
                  </Badge>
                  {doc.subsystem && (
                    <Badge variant="outline" className="text-xs">
                      {SUBSYSTEMS.find(s => s.value === doc.subsystem)?.label || doc.subsystem}
                    </Badge>
                  )}
                </div>

                {doc.description && (
                  <p className="text-sm text-slate-500 line-clamp-2 mb-3">{doc.description}</p>
                )}

                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-[#e20404] hover:text-[#c00303] font-medium"
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  View Document
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Technical Document</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="title">Document Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., LS3 Service Manual - Torque Specs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Platform *</Label>
                <Select
                  value={formData.platform_id}
                  onValueChange={(value) => setFormData({ ...formData, platform_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} {p.year_range_start && `(${p.year_range_start}-${p.year_range_end || "?"})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.platform_id && getSelectedPlatformYearRange(formData.platform_id) && (
                  <p className="text-xs text-slate-500">Year Range: {getSelectedPlatformYearRange(formData.platform_id)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Document Type *</Label>
                <Select
                  value={formData.document_type}
                  onValueChange={(value) => setFormData({ ...formData, document_type: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Subsystem</Label>
              <Select
                value={formData.subsystem}
                onValueChange={(value) => setFormData({ ...formData, subsystem: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select subsystem..." />
                </SelectTrigger>
                <SelectContent>
                  {SUBSYSTEMS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>File *</Label>
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-[#e20404]/30 transition-colors">
                {formData.file_url ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-500" />
                    <span className="text-sm text-slate-700">{formData.file_name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setFormData({ ...formData, file_url: "", file_name: "" })}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    />
                    <div className="flex flex-col items-center">
                      <Upload className="w-8 h-8 text-slate-400 mb-2" />
                      <span className="text-sm text-slate-600">
                        {uploading ? "Uploading..." : "Click to upload file"}
                      </span>
                    </div>
                  </label>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Year Start</Label>
                <Input
                  type="number"
                  value={formData.year_applicable_start}
                  onChange={(e) => setFormData({ ...formData, year_applicable_start: e.target.value })}
                  placeholder="1998"
                />
              </div>
              <div className="space-y-2">
                <Label>Year End</Label>
                <Input
                  type="number"
                  value={formData.year_applicable_end}
                  onChange={(e) => setFormData({ ...formData, year_applicable_end: e.target.value })}
                  placeholder="2015"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of document contents..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add tag..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                />
                <Button type="button" variant="outline" onClick={addTag}>Add</Button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <X className="w-3 h-3 cursor-pointer" onClick={() => removeTag(tag)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#e20404] hover:bg-[#c00303] text-white"
                disabled={createMutation.isPending || !formData.file_url || !formData.platform_id}
              >
                Upload Document
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}