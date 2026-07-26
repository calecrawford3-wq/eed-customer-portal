import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function EmailNotifySettingsModal({ open, onClose }) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => (await base44.entities.AppSettings.filter({ key: "global" }))[0],
  });
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("07:00");
  const [notifyFullResync, setNotifyFullResync] = useState(false);

  useEffect(() => {
    try {
      const cfg = settings?.email_notify_quiet_hours ? JSON.parse(settings.email_notify_quiet_hours) : null;
      if (cfg) {
        setEnabled(!!cfg.enabled);
        setStart(cfg.start || "22:00");
        setEnd(cfg.end || "07:00");
      }
      setNotifyFullResync(settings?.email_notify_on_full_resync === true);
    } catch (_) { /* ignore */ }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const list = await base44.entities.AppSettings.filter({ key: "global" });
      const s = list && list[0];
      const payload = {
        email_notify_quiet_hours: JSON.stringify({ enabled, start, end }),
        email_notify_on_full_resync: notifyFullResync,
      };
      if (s) await base44.entities.AppSettings.update(s.id, payload);
      else await base44.entities.AppSettings.create({ key: "global", ...payload });
    },
    onSuccess: () => {
      toast.success("Notification settings saved");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      onClose();
    },
    onError: (e) => toast.error("Save failed: " + (e?.message || "error")),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notification settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label>Quiet hours</Label>
              <p className="text-xs text-slate-500">Suppress new-email push alerts during this window (shop time, America/Chicago).</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="text-xs text-slate-500">Start</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={!enabled} />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-slate-500">End</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={!enabled} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label>Notify on full resync</Label>
              <p className="text-xs text-slate-500">Push alerts for old emails pulled during a full historical resync (off by default).</p>
            </div>
            <Switch checked={notifyFullResync} onCheckedChange={setNotifyFullResync} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="bg-[#e20404] hover:bg-[#c00303]">
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}