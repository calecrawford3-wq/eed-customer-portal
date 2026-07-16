import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cpu, Printer, ClipboardList, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";
import { printEngineLabel } from "./EngineLabelPrint";

function getPlatformLabel(platform) {
  if (!platform) return "Unknown";
  const years = platform.year_range_start
    ? ` (${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"})`
    : "";
  return `${platform.manufacturer} ${platform.name}${years}`;
}

const COMMON_LOCATIONS = ["Cart 1", "Cart 2", "Cart 3", "Tote 1", "Tote 2", "Tote 3", "Rack A-1", "Rack A-2", "Bench 1", "Bench 2"];

export default function EngineCheckInModal({ open, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    engine_serial_number: "",
    customer_id: "",
    platform_id: "",
    storage_location: "",
    notes: "",
  });
  const [checkedInEngine, setCheckedInEngine] = useState(null);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 500),
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 200),
  });

  const { data: allEngines = [] } = useQuery({
    queryKey: ["all-engines-for-eed"],
    queryFn: () => base44.entities.CustomerEngine.list("-created_date", 1000),
    enabled: open,
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
      const existing = allEngines.find(e => e.engine_serial_number === data.engine_serial_number);
      if (existing) {
        throw new Error(`Serial ${data.engine_serial_number} is already registered as ${existing.eed_id}`);
      }
      return base44.entities.CustomerEngine.create(data);
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["customer-engines"] });
      qc.invalidateQueries({ queryKey: ["all-engines-for-eed"] });
      qc.invalidateQueries({ queryKey: ["checked-in-engines"] });
      setCheckedInEngine(created);
      toast.success(`Engine ${created.eed_id} checked in!`);
      // Auto-print check-in label
      const customer = customers.find(c => c.id === created.customer_id);
      const platform = platforms.find(p => p.id === created.platform_id);
      printEngineLabel({
        engineSerialNumber: created.engine_serial_number,
        eedId: created.eed_id,
        customerName: customer ? `${customer.first_name} ${customer.last_name}` : "",
        platformName: platform ? getPlatformLabel(platform) : "",
        storageLocation: created.storage_location,
        statusLabel: "CHECKED IN",
        barcodeValue: created.engine_serial_number,
      });
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (open) {
      setForm({
        engine_serial_number: "",
        customer_id: "",
        platform_id: "",
        storage_location: "",
        notes: "",
      });
      setCheckedInEngine(null);
    }
  }, [open]);

  const handleCheckIn = () => {
    if (!form.engine_serial_number || !form.customer_id || !form.platform_id) {
      toast.error("Serial number, customer, and platform are required");
      return;
    }
    createMutation.mutate({
      ...form,
      eed_id: getNextEedId(),
      check_in_status: "checked_in",
      check_in_date: new Date().toISOString().split("T")[0],
    });
  };

  const handleStartEstimate = () => {
    qc.invalidateQueries({ queryKey: ["checked-in-engines"] });
    navigate(`/EstimateDetail?new=1&customer_id=${form.customer_id}`);
    onClose();
  };

  const handleClose = () => {
    qc.invalidateQueries({ queryKey: ["checked-in-engines"] });
    onClose();
  };

  const selectedCustomer = customers.find(c => c.id === form.customer_id);
  const selectedPlatform = platforms.find(p => p.id === form.platform_id);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#e20404]" /> Check In Engine
          </DialogTitle>
        </DialogHeader>

        {checkedInEngine ? (
          <div className="space-y-4 py-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
              <Cpu className="w-10 h-10 mx-auto mb-2 text-emerald-600" />
              <p className="font-bold text-emerald-800">Engine Checked In!</p>
              <p className="text-sm text-emerald-600 mt-1">
                <span className="font-mono font-bold">{checkedInEngine.eed_id}</span> — {checkedInEngine.engine_serial_number}
              </p>
              {selectedCustomer && (
                <p className="text-xs text-emerald-500 mt-1">{selectedCustomer.first_name} {selectedCustomer.last_name}</p>
              )}
            </div>
            <p className="text-sm text-slate-500 text-center">
              A check-in label has been sent to the printer. Stick it on the engine or storage container.
            </p>
            <div className="flex flex-col gap-2">
              <Button className="w-full bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleStartEstimate}>
                <ClipboardList className="w-4 h-4 mr-2" /> Start Estimate
              </Button>
              <Button variant="outline" className="w-full" onClick={() => {
                const customer = customers.find(c => c.id === checkedInEngine.customer_id);
                const platform = platforms.find(p => p.id === checkedInEngine.platform_id);
                printEngineLabel({
                  engineSerialNumber: checkedInEngine.engine_serial_number,
                  eedId: checkedInEngine.eed_id,
                  customerName: customer ? `${customer.first_name} ${customer.last_name}` : "",
                  platformName: platform ? getPlatformLabel(platform) : "",
                  storageLocation: checkedInEngine.storage_location,
                  statusLabel: "CHECKED IN",
                  barcodeValue: checkedInEngine.engine_serial_number,
                });
              }}>
                <Printer className="w-4 h-4 mr-2" /> Reprint Label
              </Button>
              <Button variant="ghost" className="w-full" onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <Label>Engine Serial Number *</Label>
              <Input
                value={form.engine_serial_number}
                onChange={(e) => setForm({ ...form, engine_serial_number: e.target.value })}
                placeholder="e.g., T708-123456"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Customer *</Label>
              <div className="mt-1">
                <CustomerSearchSelect
                  customers={customers}
                  value={form.customer_id}
                  onValueChange={(v) => setForm({ ...form, customer_id: v })}
                />
              </div>
            </div>
            <div>
              <Label>Engine Platform *</Label>
              <Select
                value={form.platform_id}
                onValueChange={(v) => setForm({ ...form, platform_id: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select platform..." />
                </SelectTrigger>
                <SelectContent>
                  {platforms.filter(p => p.status !== "archived").map(p => (
                    <SelectItem key={p.id} value={p.id}>{getPlatformLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Storage Location *</Label>
              <Input
                value={form.storage_location}
                onChange={(e) => setForm({ ...form, storage_location: e.target.value })}
                placeholder="e.g., Cart 1, Tote 3, Rack A-2..."
                className="mt-1"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {COMMON_LOCATIONS.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setForm({ ...form, storage_location: loc })}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      form.storage_location === loc
                        ? "border-[#e20404] bg-[#e20404] text-white"
                        : "border-slate-200 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Customer drop-off notes, what they want done..."
                className="mt-1"
              />
            </div>
            {open && (
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500">Next EED ID:</span>
                <span className="font-mono font-bold text-[#e20404]">{getNextEedId()}</span>
              </div>
            )}
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
              <p className="font-semibold mb-1">What happens on check-in:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Engine is registered with a new EED ID</li>
                <li>A check-in label is automatically printed with barcode</li>
                <li>Engine appears on the Shop Display as "Checked In"</li>
                <li>You can start an estimate immediately or later</li>
              </ul>
            </div>
          </div>
        )}

        {!checkedInEngine && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button
              className="bg-[#e20404] hover:bg-[#c00303] text-white"
              onClick={handleCheckIn}
              disabled={createMutation.isPending || !form.engine_serial_number || !form.customer_id || !form.platform_id || !form.storage_location}
            >
              {createMutation.isPending ? "Checking In..." : "Check In & Print Label"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}