import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";

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

const EMPTY_FORM = {
  title: "",
  platform_id: "",
  document_type: "",
  subsystem: "",
  file_url: "",
  file_name: "",
  year_applicable_start: "",
  year_applicable_end: "",
  description: "",
  tags: [],
};

export default function DocumentUploadDialog({ open, onOpenChange, platforms, onCreate }) {
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [tagInput, setTagInput] = useState("");

  const getSelectedPlatformYearRange = (platformId) => {
    const platform = platforms.find((p) => p.id === platformId);
    if (platform && (platform.year_range_start || platform.year_range_end)) {
      return `${platform.year_range_start || "?"} - ${platform.year_range_end || "?"}`;
    }
    return null;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData((prev) => ({ ...prev, file_url, file_name: file.name }));
    } catch {
      toast.error("Failed to upload file");
    }
    setUploading(false);
  };

  const closeDialog = () => {
    onOpenChange(false);
    setFormData(EMPTY_FORM);
    setTagInput("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      year_applicable_start: formData.year_applicable_start ? Number(formData.year_applicable_start) : null,
      year_applicable_end: formData.year_applicable_end ? Number(formData.year_applicable_end) : null,
    };
    onCreate(data, closeDialog);
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, tagInput.trim()] });
      setTagInput("");
    }
  };

  const removeTag = (tag) => {
    setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tag) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              disabled={!formData.file_url || !formData.platform_id}
            >
              Upload Document
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}