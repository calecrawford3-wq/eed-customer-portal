import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Wrench } from "lucide-react";
import { toast } from "sonner";

export default function LinkBuildDialog({ open, onClose, job, currentBuildId }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: buildsData } = useQuery({
    queryKey: ["link-builds", job?.customer_id],
    queryFn: () =>
      base44.entities.EngineBuild.filter(
        { customer_id: job.customer_id },
        { sort: "-created_date", limit: 100, fields: ["engine_serial_number", "eed_id", "status", "platform_id", "picked_up"] }
      ),
    enabled: !!job?.customer_id && open,
  });

  const builds = buildsData?.items || buildsData || [];
  const filtered = builds.filter(
    (b) =>
      b.id !== currentBuildId &&
      (!search ||
        (b.engine_serial_number || "").toLowerCase().includes(search.toLowerCase()) ||
        (b.eed_id || "").toLowerCase().includes(search.toLowerCase()))
  );

  const linkBuild = async (buildId) => {
    setSaving(true);
    try {
      await base44.entities.Job.update(job.id, { build_id: buildId });
      qc.invalidateQueries({ queryKey: ["job", job.id] });
      qc.invalidateQueries({ queryKey: ["job-linked", "EngineBuild"] });
      toast.success("Build linked to job");
      onClose();
    } catch (e) {
      toast.error("Failed to link build: " + e.message);
    }
    setSaving(false);
  };

  const unlinkBuild = async () => {
    setSaving(true);
    try {
      await base44.entities.Job.update(job.id, { build_id: "" });
      qc.invalidateQueries({ queryKey: ["job", job.id] });
      qc.invalidateQueries({ queryKey: ["job-linked", "EngineBuild"] });
      toast.success("Build unlinked from job");
      onClose();
    } catch (e) {
      toast.error("Failed to unlink build: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {currentBuildId ? "Change Build" : "Link Build"} for {job?.job_number}
          </DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search serial or EED ID..."
            className="pl-9 h-9"
          />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No available builds found for this customer.
            </p>
          ) : (
            filtered.map((b) => (
              <button
                key={b.id}
                onClick={() => linkBuild(b.id)}
                disabled={saving}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-[#e20404] hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-slate-400" />
                  <span className="font-mono text-sm">{b.eed_id || b.engine_serial_number}</span>
                  <Badge variant="outline" className="text-xs capitalize">{(b.status || "").replace("_", " ")}</Badge>
                  {b.picked_up && <Badge className="bg-slate-100 text-slate-600 border-0 text-xs">Picked Up</Badge>}
                </div>
                {b.engine_serial_number && b.eed_id && (
                  <span className="text-xs text-slate-400 font-mono">{b.engine_serial_number}</span>
                )}
              </button>
            ))
          )}
        </div>
        <DialogFooter className="flex justify-between">
          {currentBuildId ? (
            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={unlinkBuild} disabled={saving}>
              Unlink Build
            </Button>
          ) : <span />}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}