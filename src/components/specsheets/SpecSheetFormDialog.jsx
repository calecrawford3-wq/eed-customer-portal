import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SpecSheetFormDialog({
  open,
  onOpenChange,
  mode = "create",
  platforms = [],
  specTypes = [],
  data,
  setData,
  onConfirm,
  isPending = false,
}) {
  const isDuplicate = mode === "duplicate";
  const title = isDuplicate ? "Duplicate Spec Sheet" : "Create New Spec Sheet";
  const confirmLabel = isDuplicate ? "Duplicate Spec Sheet" : "Create Spec Sheet";

  const getSelectedPlatformYearRange = (platformId) => {
    const platform = platforms.find(p => p.id === platformId);
    if (platform && (platform.year_range_start || platform.year_range_end)) {
      return `${platform.year_range_start || "?"} - ${platform.year_range_end || "?"}`;
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Engine Platform *</Label>
            <Select
              value={data.platform_id}
              onValueChange={(value) => setData({ ...data, platform_id: value })}
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
            {data.platform_id && getSelectedPlatformYearRange(data.platform_id) && (
              <p className="text-xs text-slate-500">Year Range: {getSelectedPlatformYearRange(data.platform_id)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Specification Type *</Label>
            <Select
              value={data.spec_type}
              onValueChange={(value) => setData({ ...data, spec_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {specTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(data.spec_type === "contract" || data.spec_type === "custom") && (
            <div className="space-y-2">
              <Label>Custom Name</Label>
              <Input
                value={data.custom_name}
                onChange={(e) => setData({ ...data, custom_name: e.target.value })}
                placeholder="e.g., Team XYZ Build Spec"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              className="bg-[#e20404] hover:bg-[#c00303] text-white"
              disabled={!data.platform_id || isPending}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}