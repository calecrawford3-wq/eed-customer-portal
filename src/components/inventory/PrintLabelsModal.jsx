import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, Printer, CheckCheck } from "lucide-react";
import BarcodeLabel, { generateBarcodeSVG } from "@/components/inventory/BarcodeLabel";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const buildPrintHtml = (labels) => {
  const labelHtml = labels.map((l) => {
    const barcode = generateBarcodeSVG(l.code, { width: 1.6, height: 40, fontSize: 12 });
    return `
      <div class="label">
        <div class="label-title">${esc(l.name)}</div>
        <div class="barcode">${barcode || `<div class="no-bc">No barcode</div>`}</div>
        <div class="label-footer">
          <span class="loc">${esc(l.location ? `📍 ${l.location}` : "")}</span>
          <span class="code">${esc(l.code)}</span>
        </div>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><title>Print Labels</title>
<style>
  @page { margin: 0.3in; size: auto; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .labels { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-start; }
  .label {
    width: 3in; height: 1.4in;
    border: 1px dashed #bbb;
    padding: 6px 8px;
    display: flex; flex-direction: column; justify-content: space-between;
    page-break-inside: avoid;
    overflow: hidden;
  }
  .label-title { font-size: 10px; font-weight: 700; line-height: 1.15; max-height: 26px; overflow: hidden; }
  .barcode { text-align: center; flex: 1; display: flex; align-items: center; justify-content: center; }
  .barcode svg { max-width: 100%; height: auto; }
  .no-bc { font-size: 10px; color: #999; }
  .label-footer { display: flex; justify-content: space-between; align-items: center; font-size: 8px; color: #666; }
  .code { font-family: monospace; }
</style></head>
<body><div class="labels">${labelHtml}</div>
<script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
</body></html>`;
};

export default function PrintLabelsModal({ open, onClose, items, title = "Print Labels" }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [copies, setCopies] = useState(1);

  React.useEffect(() => {
    if (open) {
      setSelected(new Set(items.map((i) => i.id)));
      setSearch("");
      setCopies(1);
    }
  }, [open, items]);

  const filtered = useMemo(
    () => items.filter((i) => `${i.code} ${i.name} ${i.location || ""}`.toLowerCase().includes(search.toLowerCase())),
    [items, search]
  );

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map((i) => i.id)));
  const clearAll = () => setSelected(new Set());

  const handlePrint = () => {
    const chosen = items.filter((i) => selected.has(i.id));
    const labels = [];
    chosen.forEach((i) => {
      for (let c = 0; c < (Number(copies) || 1); c++) {
        labels.push({ code: i.code, name: i.name, location: i.location });
      }
    });
    if (labels.length === 0) return;
    const html = buildPrintHtml(labels);
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) {
      alert("Please allow popups to print labels.");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Printer className="w-5 h-5" /> {title}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3 items-center mb-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input className="pl-10" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={selectAll}><CheckCheck className="w-4 h-4 mr-1" /> All</Button>
          <Button variant="outline" size="sm" onClick={clearAll}>Clear</Button>
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Copies</Label>
            <Input type="number" min="1" className="w-16" value={copies} onChange={(e) => setCopies(Number(e.target.value))} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border rounded-lg bg-slate-50 p-3 min-h-[200px]">
          {filtered.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">No items found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filtered.map((i) => {
                const checked = selected.has(i.id);
                return (
                  <label
                    key={i.id}
                    className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer ${checked ? "border-[#e20404] bg-white" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(i.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-slate-800 truncate">{i.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{i.code}{i.location ? ` · ${i.location}` : ""}</div>
                    </div>
                    <BarcodeLabel value={i.code} className="hidden lg:flex w-24" />
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <span className="text-sm text-slate-500 mr-auto">{selected.size} selected</span>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handlePrint} disabled={selected.size === 0}>
            <Printer className="w-4 h-4 mr-2" /> Print {selected.size > 0 ? `(${selected.size * (Number(copies) || 1)})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}