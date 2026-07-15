import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Percent } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["block", "rotating_assembly", "cylinder_head", "valvetrain", "timing", "oiling", "fasteners", "gaskets", "seals", "electrical", "other"];

const calcSellPrice = (cost, markup) => {
  const c = Number(cost) || 0;
  const m = Number(markup) || 0;
  return parseFloat((c * (1 + m / 100)).toFixed(2));
};

export default function PartEditModal({ part, open, onClose, onSaved }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(part ? { ...part } : {});

  // Re-seed form when the opened part changes
  React.useEffect(() => {
    if (open && part) setForm({ ...part });
  }, [open, part]);

  const { data: enginePlatforms = [] } = useQuery({
    queryKey: ["enginePlatforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-name", 200),
  });

  const sortedPlatforms = [...enginePlatforms].sort((a, b) =>
    `${a.manufacturer} ${a.name}`.localeCompare(`${b.manufacturer} ${b.name}`)
  );

  const togglePlatform = (platformId) => {
    setForm((f) => {
      const current = Array.isArray(f.platform_ids) ? f.platform_ids : [];
      return {
        ...f,
        platform_ids: current.includes(platformId)
          ? current.filter((id) => id !== platformId)
          : [...current, platformId],
      };
    });
  };

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.Part.update(part.id, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["parts"] });
      toast.success("Part updated");
      onSaved?.(updated);
      onClose();
    },
    onError: (e) => toast.error("Update failed: " + (e.message || e)),
  });

  if (!part) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Part</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div><Label>Part Number *</Label><Input value={form.part_number ?? ""} onChange={e => setForm({ ...form, part_number: e.target.value })} /></div>
          <div><Label>Name *</Label><Input value={form.name ?? ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label>Category</Label>
            <Select value={form.category || "other"} onValueChange={v => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Supplier Part #</Label><Input value={form.supplier_part_number ?? ""} onChange={e => setForm({ ...form, supplier_part_number: e.target.value })} /></div>
          <div><Label>Storage Location</Label><Input value={form.location ?? ""} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Shelf A3" /></div>
          <div>
            <Label>Unit Cost ($)</Label>
            <Input
              type="number"
              value={form.unit_cost ?? ""}
              onChange={e => {
                const cost = e.target.value;
                const updates = { unit_cost: cost };
                if (form.use_markup) updates.sell_price = calcSellPrice((Number(cost) || 0) + (Number(form.shipping_cost) || 0), form.markup_percentage);
                setForm(f => ({ ...f, ...updates }));
              }}
            />
          </div>
          <div>
            <Label>Shipping ($)</Label>
            <Input
              type="number"
              value={form.shipping_cost ?? ""}
              onChange={e => {
                const ship = e.target.value;
                const updates = { shipping_cost: ship };
                if (form.use_markup) updates.sell_price = calcSellPrice((Number(form.unit_cost) || 0) + (Number(ship) || 0), form.markup_percentage);
                setForm(f => ({ ...f, ...updates }));
              }}
              min="0" step="0.01" placeholder="0"
            />
          </div>
          <div>
            <Label>Total Cost ($)</Label>
            <Input value={((Number(form.unit_cost) || 0) + (Number(form.shipping_cost) || 0)).toFixed(2)} disabled className="bg-slate-50 text-slate-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Sell Price ($)</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">% Markup</span>
                <Switch
                  checked={!!form.use_markup}
                  onCheckedChange={v => {
                    const updates = { use_markup: v };
                    if (v) updates.sell_price = calcSellPrice((Number(form.unit_cost) || 0) + (Number(form.shipping_cost) || 0), form.markup_percentage);
                    setForm(f => ({ ...f, ...updates }));
                  }}
                />
              </div>
            </div>
            {form.use_markup ? (
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Input
                    type="number"
                    value={form.markup_percentage ?? 0}
                    onChange={e => {
                      const pct = e.target.value;
                      setForm(f => ({
                        ...f,
                        markup_percentage: pct,
                        sell_price: calcSellPrice((Number(f.unit_cost) || 0) + (Number(f.shipping_cost) || 0), pct),
                      }));
                    }}
                    min="0" step="1" placeholder="50"
                  />
                  <Percent className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                </div>
                <span className="text-sm text-slate-500 whitespace-nowrap">
                  = ${calcSellPrice((Number(form.unit_cost) || 0) + (Number(form.shipping_cost) || 0), form.markup_percentage).toFixed(2)}
                </span>
              </div>
            ) : (
              <Input type="number" value={form.sell_price ?? ""} onChange={e => setForm({ ...form, sell_price: e.target.value })} />
            )}
          </div>
          <div><Label>Quantity On Hand</Label><Input type="number" value={form.quantity_on_hand ?? 0} onChange={e => setForm({ ...form, quantity_on_hand: Number(e.target.value) })} /></div>
          <div><Label>Reorder Point</Label><Input type="number" value={form.reorder_point ?? 0} onChange={e => setForm({ ...form, reorder_point: Number(e.target.value) })} /></div>
          <div><Label>Max Stock</Label><Input type="number" value={form.reorder_quantity ?? 0} onChange={e => setForm({ ...form, reorder_quantity: Number(e.target.value) })} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status || "active"} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="discontinued">Discontinued</SelectItem>
                <SelectItem value="special_order">Special Order</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Compatible Engine Platforms</Label>
            <p className="text-xs text-slate-400 mb-2">Tag this part as compatible with one or more engine platforms (year/make/model).</p>
            <div className="max-h-36 overflow-y-auto grid grid-cols-2 gap-1.5 p-2 border rounded-lg bg-slate-50">
              {sortedPlatforms.length === 0 && (
                <p className="text-xs text-slate-400 col-span-2 py-2 text-center">No engine platforms configured.</p>
              )}
              {sortedPlatforms.map(p => {
                const checked = (form.platform_ids || []).includes(p.id);
                const years = p.year_range_start || p.year_range_end
                  ? `${p.year_range_start ?? ""}${p.year_range_end ? `–${p.year_range_end}` : ""}`
                  : "";
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md border cursor-pointer text-xs ${checked ? "border-[#e20404] bg-[#e20404]/5" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => togglePlatform(p.id)} />
                    <span className="font-medium text-slate-700">{p.manufacturer}</span>
                    <span className="text-slate-500">{p.name}</span>
                    {years && <span className="text-slate-400">{years}</span>}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="col-span-2"><Label>Description</Label><Textarea value={form.description ?? ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
          <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}