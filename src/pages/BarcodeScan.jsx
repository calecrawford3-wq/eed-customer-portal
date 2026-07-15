import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScanLine, Package, Recycle, Minus, Plus, Save, RotateCcw, MapPin, DollarSign, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import BarcodeScanner from "@/components/inventory/BarcodeScanner";
import BarcodeLabel from "@/components/inventory/BarcodeLabel";

export default function BarcodeScan() {
  const [result, setResult] = useState(null); // { type, item }
  const [searching, setSearching] = useState(false);
  const [qtyInput, setQtyInput] = useState("");
  const qc = useQueryClient();

  const lookup = async (code) => {
    const clean = code.trim();
    if (!clean) return;
    setSearching(true);
    setResult(null);
    try {
      const [parts, cores] = await Promise.all([
        base44.entities.Part.filter({ part_number: clean }),
        base44.entities.EngineCore.filter({ core_number: clean }),
      ]);
      if (parts.length > 0) {
        setResult({ type: "part", item: parts[0] });
        setQtyInput(String(parts[0].quantity_on_hand ?? 0));
      } else if (cores.length > 0) {
        setResult({ type: "core", item: cores[0] });
        setQtyInput(String(cores[0].quantity_on_hand ?? 0));
      } else {
        toast.error(`No item found for "${clean}"`);
      }
    } catch (e) {
      toast.error("Lookup failed: " + (e.message || e));
    } finally {
      setSearching(false);
    }
  };

  const adjustMutation = useMutation({
    mutationFn: async ({ id, type, qty }) => {
      if (type === "part") return base44.entities.Part.update(id, { quantity_on_hand: qty });
      return base44.entities.EngineCore.update(id, { quantity_on_hand: qty });
    },
    onSuccess: (updated) => {
      setResult((r) => (r ? { ...r, item: { ...r.item, quantity_on_hand: updated.quantity_on_hand } } : r));
      setQtyInput(String(updated.quantity_on_hand));
      qc.invalidateQueries({ queryKey: ["parts"] });
      qc.invalidateQueries({ queryKey: ["engineCores"] });
      toast.success("Inventory updated");
    },
    onError: (e) => toast.error("Update failed: " + (e.message || e)),
  });

  const saveQty = () => {
    if (!result) return;
    const qty = Number(qtyInput) || 0;
    adjustMutation.mutate({ id: result.item.id, type: result.type, qty });
  };

  const bump = (delta) => {
    const cur = Number(qtyInput) || 0;
    setQtyInput(String(Math.max(0, cur + delta)));
  };

  const reset = () => {
    setResult(null);
    setQtyInput("");
  };

  const isPart = result?.type === "part";
  const item = result?.item;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
          <ScanLine className="w-7 h-7 text-[#e20404]" /> Barcode Scan & Adjust
        </h1>
        <p className="text-slate-500 mt-1">Scan or type a part/core number to look it up and adjust inventory.</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Scan Item</CardTitle>
        </CardHeader>
        <CardContent>
          {searching ? (
            <div className="flex items-center gap-2 text-slate-500 py-4">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-[#e20404] rounded-full animate-spin" />
              Looking up item...
            </div>
          ) : (
            <BarcodeScanner onScan={lookup} />
          )}
        </CardContent>
      </Card>

      {item && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
              <span className="flex items-center gap-2">
                {isPart ? <Package className="w-5 h-5 text-blue-600" /> : <Recycle className="w-5 h-5 text-emerald-600" />}
                {item.name}
              </span>
              <Badge className={isPart ? "bg-blue-100 text-blue-700 border-0" : "bg-emerald-100 text-emerald-700 border-0"}>
                {isPart ? "Part" : "Engine Core"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50 rounded-lg p-4">
              <div className="text-center">
                <BarcodeLabel value={isPart ? item.part_number : item.core_number} />
              </div>
              <div className="flex-1 grid grid-cols-2 gap-3 w-full">
                <div>
                  <Label className="text-xs text-slate-500">{isPart ? "Part #" : "Core #"}</Label>
                  <p className="font-mono font-medium text-slate-800">{isPart ? item.part_number : item.core_number}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Location</Label>
                  <p className="text-slate-800 flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" />{item.location || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Category</Label>
                  <p className="text-slate-800 capitalize">{item.category?.replace("_", " ")}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Status</Label>
                  <Badge className="bg-slate-100 text-slate-600 border-0">{item.status}</Badge>
                </div>
                {isPart ? (
                  <>
                    <div>
                      <Label className="text-xs text-slate-500">Unit Cost</Label>
                      <p className="text-slate-800 flex items-center gap-1"><DollarSign className="w-3 h-3 text-slate-400" />{item.unit_cost ? Number(item.unit_cost).toFixed(2) : "—"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Sell Price</Label>
                      <p className="text-slate-800">{item.sell_price ? `$${Number(item.sell_price).toFixed(2)}` : "—"}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <Label className="text-xs text-slate-500">Core Value</Label>
                      <p className="text-slate-800">{item.unit_cost ? `$${Number(item.unit_cost).toFixed(2)}` : "—"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Condition</Label>
                      <Badge className="bg-amber-100 text-amber-700 border-0 capitalize">{(item.condition || "").replace("_", " ")}</Badge>
                    </div>
                  </>
                )}
              </div>
            </div>

            {item.description && (
              <div>
                <Label className="text-xs text-slate-500">Description</Label>
                <p className="text-sm text-slate-600">{item.description}</p>
              </div>
            )}

            <div className="border-t pt-4">
              <Label className="text-sm font-medium text-slate-700">Adjust Quantity On Hand</Label>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Button variant="outline" size="icon" onClick={() => bump(-1)}><Minus className="w-4 h-4" /></Button>
                <Input
                  type="number"
                  className="w-28 text-center text-lg font-semibold"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                />
                <Button variant="outline" size="icon" onClick={() => bump(1)}><Plus className="w-4 h-4" /></Button>
                <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={saveQty} disabled={adjustMutation.isPending}>
                  <Save className="w-4 h-4 mr-1" /> {adjustMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" onClick={reset}><RotateCcw className="w-4 h-4 mr-1" /> Scan Next</Button>
              </div>
              {(item.reorder_point > 0 && (Number(qtyInput) || 0) <= item.reorder_point) && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> At or below reorder point ({item.reorder_point}).</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}