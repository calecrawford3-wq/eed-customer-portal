import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Cpu, Plus, ChevronDown } from "lucide-react";
import { toast } from "sonner";

function getPlatformLabel(platform) {
  if (!platform) return "Unknown";
  const years = platform.year_range_start
    ? ` (${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"})`
    : "";
  return `${platform.manufacturer} ${platform.name}${years}`;
}

export default function EngineSelector({ customerId, value, onChange, platforms = [] }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newEngine, setNewEngine] = useState({ engine_serial_number: "", platform_id: "", notes: "" });
  const [createError, setCreateError] = useState("");

  const { data: engines = [] } = useQuery({
    queryKey: ["customer-engines", customerId],
    queryFn: () => base44.entities.CustomerEngine.filter({ customer_id: customerId }),
    enabled: !!customerId,
  });

  // Auto-generate next EED ID
  const { data: allEngines = [] } = useQuery({
    queryKey: ["all-engines-for-eed"],
    queryFn: () => base44.entities.CustomerEngine.list("-created_date", 1000),
    enabled: addOpen,
  });

  const getNextEedId = () => {
    const nums = allEngines
      .map(e => e.eed_id?.match(/^EED(\d+)$/)?.[1])
      .filter(Boolean)
      .map(Number);
    const max = nums.length > 0 ? Math.max(...nums) : 1039;
    return `EED${max + 1}`;
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Check serial number not already used with a different EED ID
      const existing = allEngines.find(e =>
        e.engine_serial_number === data.engine_serial_number && e.customer_id !== customerId
      );
      if (existing) {
        throw new Error(`Serial number ${data.engine_serial_number} is already registered as ${existing.eed_id}`);
      }
      // Check if same serial already registered for this customer
      const sameSerial = engines.find(e => e.engine_serial_number === data.engine_serial_number);
      if (sameSerial) {
        throw new Error(`Serial number already registered as ${sameSerial.eed_id} for this customer`);
      }
      return base44.entities.CustomerEngine.create(data);
    },
    onSuccess: (created) => {
      setCreateError("");
      qc.invalidateQueries({ queryKey: ["customer-engines", customerId] });
      qc.invalidateQueries({ queryKey: ["all-engines-for-eed"] });
      setAddOpen(false);
      setNewEngine({ engine_serial_number: "", platform_id: "", notes: "" });
      onChange(created.id, created);
      toast.success(`Engine ${created.eed_id} registered`);
    },
    onError: (err) => {
      setCreateError(err.message);
      toast.error(err.message);
    },
  });

  const handleAdd = () => {
    if (!newEngine.engine_serial_number || !newEngine.platform_id) {
      setCreateError("Serial number and platform are required");
      toast.error("Serial number and platform are required");
      return;
    }
    setCreateError("");
    createMutation.mutate({
      ...newEngine,
      customer_id: customerId,
      eed_id: getNextEedId(),
    });
  };

  const selected = engines.find(e => e.id === value);
  const platform = selected ? platforms.find(p => p.id === selected.platform_id) : null;

  if (!customerId) return null;

  return (
    <div className="space-y-1">
      <Label>Engine (EED)</Label>
      <div className="flex gap-2">
        <Select value={value || ""} onValueChange={(id) => {
          const eng = engines.find(e => e.id === id);
          onChange(id, eng);
        }}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select engine...">
              {selected && (() => {
                const STAGE_LABELS = { stock: "Stock", stage_1: "Stage 1", stage_2: "Stage 2", stage_3: "Stage 3", contract: "Contract", custom: "Custom" };
                return (
                  <span className="flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono font-bold text-[#e20404]">{selected.eed_id}</span>
                    <span className="text-slate-500 text-xs">— {selected.engine_serial_number}</span>
                    {selected.current_stage && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                        {STAGE_LABELS[selected.current_stage] || selected.current_stage}
                      </span>
                    )}
                  </span>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <div className="px-2 py-1 text-xs text-slate-400 font-medium uppercase tracking-wide">
              Customer Engines
            </div>
            {engines.length === 0 && (
              <div className="px-3 py-2 text-sm text-slate-400">No engines registered</div>
            )}
            {engines.map(e => {
              const p = platforms.find(pl => pl.id === e.platform_id);
              const STAGE_LABELS = { stock: "Stock", stage_1: "Stage 1", stage_2: "Stage 2", stage_3: "Stage 3", contract: "Contract", custom: "Custom" };
              return (
                <SelectItem key={e.id} value={e.id}>
                  <span className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#e20404]">{e.eed_id}</span>
                    <span className="text-slate-500">— {e.engine_serial_number}</span>
                    {p && <span className="text-xs text-slate-400">{p.manufacturer} {p.name}</span>}
                    {e.current_stage && e.current_stage !== "stock" && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                        {STAGE_LABELS[e.current_stage] || e.current_stage}
                      </span>
                    )}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAddOpen(true)}
          className="shrink-0"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> New Engine
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange("", null)}
            className="shrink-0 text-slate-400"
          >
            Clear
          </Button>
        )}
      </div>
      {selected && platform && (
        <p className="text-xs text-slate-400 pl-1">
          {getPlatformLabel(platform)}
        </p>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[#e20404]" /> Register New Engine
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Engine Serial Number *</Label>
              <Input
                value={newEngine.engine_serial_number}
                onChange={e => setNewEngine({ ...newEngine, engine_serial_number: e.target.value })}
                placeholder="e.g. T708-123456"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Engine Platform *</Label>
              <Select value={newEngine.platform_id} onValueChange={v => setNewEngine({ ...newEngine, platform_id: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select platform..." />
                </SelectTrigger>
                <SelectContent>
                  {platforms.filter(p => p.status !== "archived").map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {getPlatformLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={newEngine.notes}
                onChange={e => setNewEngine({ ...newEngine, notes: e.target.value })}
                placeholder="Optional notes..."
                className="mt-1"
              />
            </div>
            {addOpen && allEngines.length >= 0 && (
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm">
                <span className="text-slate-500">Next EED ID: </span>
                <span className="font-mono font-bold text-[#e20404]">{getNextEedId()}</span>
              </div>
            )}
          </div>
          {createError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {createError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#e20404] hover:bg-[#c00303] text-white"
              onClick={handleAdd}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Registering..." : "Register Engine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}