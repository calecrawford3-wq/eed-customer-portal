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
    mutationFn: /** @param {Record<string, any>} data */ (data) => base44.entities.Part.update(part.id, data),
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
          <div className="col-span-2 border rounded-lg p-3 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div><strong className="text-sm">Turn 14 Dropshipping</strong><p className="text-xs text-slate-600">Direct-to-customer fulfillment requests require a verified Turn 14 item link.</p></div>
              <Switch aria-label="Enable Turn 14 dropshipping" disabled={!form.turn14_item_id} checked={!!form.turn14_item_id&&!!form.turn14_dropship_enabled} onCheckedChange={v=>setForm(f=>({...f,turn14_dropship_enabled:v}))}/>
            </div>
            {form.turn14_item_id?<p className="text-xs text-green-700">Linked to Turn 14 item {form.turn14_item_id}. Enable and save to allow paid website orders into the supplier review queue.</p>:<p className="text-xs text-amber-700">Not linked to a Turn 14 item. Use Import Turn 14 to locate this product and confirm Link to Existing Part. The supplier part number alone is not sufficient.</p>}
            <p className="text-xs text-slate-500">Supplier order submission and supplier-backed website stock are not active yet.</p>
          </div>
          <div><Label>Elite Part Number *</Label><Input value={form.part_number ?? ""} onChange={e => setForm({ ...form, part_number: e.target.value })} /></div>
          <div><Label>Elite Product Name *</Label><Input value={form.name ?? ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label>Category</Label>
            <Select value={form.category || "other"} onValueChange={v => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Supplier Part # (Turn 14 SKU)</Label><Input value={form.turn14_item_id?(form.turn14_supplier_sku||form.supplier_part_number||""):(form.supplier_part_number??"")} disabled={!!form.turn14_item_id} onChange={e => setForm({ ...form, supplier_part_number: e.target.value })} /></div>
          <div><Label>Supplier Product Name</Label><Input value={form.supplier_product_name ?? ""} onChange={e => setForm({ ...form, supplier_product_name: e.target.value })} placeholder="Original supplier catalog name" /></div>
          <div><Label>Manufacturer Part Number</Label><Input value={form.manufacturer_part_number ?? ""} onChange={e => setForm({ ...form, manufacturer_part_number: e.target.value })} /></div>
          {form.turn14_item_id&&<div className="col-span-2 text-xs rounded border p-2 bg-slate-50">Turn 14 Item ID: {form.turn14_item_id}. Elite product name and part number are used for customers. Supplier SKU and supplier name are retained for purchasing. Supplier SKU is locked for linked Turn 14 items to protect ordering accuracy.</div>}
          <div><Label>Storage Location</Label><Input value={form.location ?? ""} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Shelf A3" /></div>
          <div>
            <Label>Purchase Cost per Item ($)</Label>
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
            <Label>Shipping / Landed Cost per Item ($)</Label>
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
            <Label>Total Landed Cost ($)</Label>
            <Input value={((Number(form.unit_cost) || 0) + (Number(form.shipping_cost) || 0)).toFixed(2)} disabled className="bg-slate-50 text-slate-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Base Sell Price ($)</Label>
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
          <div className="col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm space-y-1"><div className="font-semibold">Price breakdown</div>{(()=>{const cost=(Number(form.unit_cost)||0)+(Number(form.shipping_cost)||0);const sell=Number(form.sell_price)||0;const profit=sell-cost;return <><div className="flex justify-between"><span>Total landed cost</span><strong>${cost.toFixed(2)}</strong></div><div className="flex justify-between"><span>Base selling price</span><strong>${sell.toFixed(2)}</strong></div><div className="flex justify-between"><span>Gross profit / markup</span><strong>${profit.toFixed(2)} / {cost>0?(profit/cost*100).toFixed(1):"—"}%</strong></div><div className="flex justify-between border-t pt-1"><span>On a new estimate/invoice (+5%)</span><strong>${(sell*1.05).toFixed(2)}</strong></div></>})()}<p className="text-xs text-slate-600">Catalog price stays at the base selling price. The 5% allowance is added once on new estimates/invoices, not to inventory cost or existing documents.</p></div>
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
          <div className="col-span-2 border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div><h3 className="font-semibold">Website Store</h3><p className="text-xs text-slate-500">Configure this part for sale on Elite's website.</p></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.website_published} onCheckedChange={v=>setForm(f=>({...f,website_published:v}))}/> Publish</label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Website Product Name</Label><Input value={form.website_store_name??""} placeholder={form.name||"Product name"} onChange={e=>setForm(f=>({...f,website_store_name:e.target.value}))}/></div>
              <div><Label>Manufacturer / Brand</Label><Input value={form.website_brand??""} onChange={e=>setForm(f=>({...f,website_brand:e.target.value}))}/></div>
              <div><Label>Website Selling Price ($)</Label><Input type="number" min="0" step="0.01" value={form.sell_price??""} onChange={e=>setForm(f=>({...f,sell_price:e.target.value,use_markup:false}))}/><p className="text-xs text-slate-500">Uses the part's base selling price. Website price and estimate allowance are separate.</p></div>
              <div><Label>Stock Policy</Label><Select value={form.website_inventory_policy||"tracked"} onValueChange={v=>setForm(f=>({...f,website_inventory_policy:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="tracked">Track shop stock</SelectItem><SelectItem value="unlimited">Made to order / unlimited</SelectItem></SelectContent></Select></div>
              <div className="sm:col-span-2"><Label>Primary Image URL</Label><Input value={form.website_image_url??""} onChange={e=>setForm(f=>({...f,website_image_url:e.target.value}))}/></div>
              <div className="sm:col-span-2"><Label>Additional Image URLs (one per line)</Label><Textarea rows={3} value={(form.website_images||[]).join("\n")} onChange={e=>setForm(f=>({...f,website_images:e.target.value.split("\n").map(x=>x.trim()).filter(Boolean)}))}/></div>
              <div className="sm:col-span-2"><Label>Website Description</Label><Textarea rows={3} value={form.website_description??""} onChange={e=>setForm(f=>({...f,website_description:e.target.value}))}/></div>
              <div className="sm:col-span-2"><Label>SEO Title</Label><Input value={form.website_seo_title??""} onChange={e=>setForm(f=>({...f,website_seo_title:e.target.value}))}/></div>
              <div className="sm:col-span-2"><Label>SEO Description</Label><Textarea rows={2} value={form.website_seo_description??""} onChange={e=>setForm(f=>({...f,website_seo_description:e.target.value}))}/></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!form.website_show_stock_quantity} onCheckedChange={v=>setForm(f=>({...f,website_show_stock_quantity:!!v}))}/> Show exact shop stock quantity on website</label>

            {form.turn14_item_id&&<div className="rounded border bg-slate-50 p-3 text-sm"><strong>Turn 14 supplier stock:</strong> {Number(form.turn14_available_quantity)||0} available · <strong>Elite shop stock:</strong> {Number(form.quantity_on_hand)||0}<p className="text-xs text-slate-500 mt-1">Supplier stock is informational and does not increase tracked shop inventory. Select made-to-order only when fulfillment arrangements are ready.</p>{Number(form.turn14_map_price)>0&&<p className="text-xs mt-1">MAP minimum: ${Number(form.turn14_map_price).toFixed(2)}</p>}</div>}
            {form.website_published&&(!Number(form.sell_price)||Number(form.sell_price)<Number(form.turn14_map_price||0))&&<p className="text-sm text-red-700">Set a valid selling price at or above MAP before publishing.</p>}
          </div>
          <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending||(!!form.website_published&&(!Number(form.sell_price)||Number(form.sell_price)<Number(form.turn14_map_price||0)))}>
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}