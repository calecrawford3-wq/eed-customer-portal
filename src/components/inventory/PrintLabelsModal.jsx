import React, { useState, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, Printer, CheckCheck } from "lucide-react";
import { generateBarcodeSVG } from "@/components/inventory/BarcodeLabel";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const buildPrintHtml = (labels, startPos = 1) => {
  const blanks = Math.max(0, Math.min(9, startPos - 1));
  // Build a flat cell list: leading blanks + real labels
  const cells = [
    ...Array.from({ length: blanks }).map(() => ({ empty: true })),
    ...labels.map((l) => ({ ...l })),
  ];
  // Chunk into pages of 10, padding each page with empties so every page is a full 2×5 grid
  const pages = [];
  for (let i = 0; i < cells.length; i += 10) {
    const slice = cells.slice(i, i + 10);
    while (slice.length < 10) slice.push({ empty: true });
    pages.push(slice);
  }
  if (pages.length === 0) return "";

  const renderCell = (c) => {
    if (c.empty) return `<div class="label empty"></div>`;
    const barcode = generateBarcodeSVG(c.code, { width: 1.6, height: 40, fontSize: 12 });
    return `
      <div class="label">
        <div class="label-title">${esc(c.name)}${c.bagQty ? ` <span class="bag-qty">QTY: ${esc(c.bagQty)}</span>` : ""}</div>
        <div class="barcode">${barcode || `<div class="no-bc">No barcode</div>`}</div>
        <div class="label-footer">
          <span class="loc">${esc(c.location ? `📍 ${c.location}` : "")}</span>
          <span class="code">${esc(c.code)}</span>
        </div>
        ${c.platforms ? `<div class="label-line">${esc(c.platforms)}</div>` : ""}
        ${c.notes ? `<div class="label-line notes">📝 ${esc(c.notes)}</div>` : ""}
      </div>`;
  };

  const pageHtml = pages.map((pageCells) => {
    return `<div class="page"><div class="labels">${pageCells.map(renderCell).join("")}</div></div>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><title>Print Labels</title>
<style>
  @page { size: 8.5in 11in; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  /* Each physical sheet = one .page with Avery 18163 margins as padding (reliable,
     not dependent on @page margin support). Content area = 8.1875in × 10in. */
  .page {
    width: 8.5in; height: 11in;
    padding: 0.5in 0.15625in;
    page-break-after: always;
    page-break-inside: avoid;
  }
  .page:last-child { page-break-after: auto; }
  /* Avery 18163: 2 columns × 5 rows = 10 labels per sheet, 4in × 2in each */
  .labels {
    display: grid;
    grid-template-columns: repeat(2, 4in);
    grid-template-rows: repeat(5, 2in);
    column-gap: 0.1875in;
    row-gap: 0in;
    width: 8.1875in;
    height: 10in;
  }
  .label {
    width: 4in; height: 2in;
    padding: 5px 8px;
    display: flex; flex-direction: column; justify-content: space-between;
    overflow: hidden;
    break-inside: avoid;
  }
  .label.empty { border: none; padding: 0; }
  .label-title { font-size: 11px; font-weight: 700; line-height: 1.2; max-height: 40px; overflow: hidden; }
  .bag-qty { display: inline-block; margin-left: 6px; padding: 1px 5px; background: #e20404; color: #fff; border-radius: 4px; font-size: 11px; font-weight: 700; }
  .barcode { text-align: center; flex: 1; display: flex; align-items: center; justify-content: center; padding: 2px 0; }
  .barcode svg { max-width: 100%; height: auto; }
  .no-bc { font-size: 11px; color: #999; }
  .label-footer { display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #555; }
  .code { font-family: monospace; }
  .label-line { font-size: 8.5px; color: #444; line-height: 1.15; max-height: 26px; overflow: hidden; }
  .label-line.notes { color: #333; font-style: italic; }
</style></head>
<body>${pageHtml}
<script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
</body></html>`;
};

export default function PrintLabelsModal({ open, onClose, items, title = "Print Labels", preselectId }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [quantities, setQuantities] = useState({});
  const [bagQuantities, setBagQuantities] = useState({});
  const [startPos, setStartPos] = useState(1);
  const qtyRefs = useRef({});

  React.useEffect(() => {
    if (open) {
      const q = {};
      const bq = {};
      items.forEach((i) => { q[i.id] = 1; bq[i.id] = ""; });
      setQuantities(q);
      setBagQuantities(bq);
      if (preselectId) {
        setSelected(new Set([preselectId]));
        setTimeout(() => { qtyRefs.current[preselectId]?.focus(); qtyRefs.current[preselectId]?.select(); }, 100);
      } else {
        setSelected(new Set(items.map((i) => i.id)));
      }
      setSearch("");
      setStartPos(1);
    }
  }, [open, items, preselectId]);

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

  const totalCount = items
    .filter((i) => selected.has(i.id))
    .reduce((sum, i) => sum + (Math.max(1, Number(quantities[i.id]) || 1)), 0);

  const handlePrint = () => {
    const chosen = items.filter((i) => selected.has(i.id));
    const labels = [];
    chosen.forEach((i) => {
      const qty = Math.max(1, Number(quantities[i.id]) || 1);
      const bagQty = Number(bagQuantities[i.id]) || 0;
      for (let c = 0; c < qty; c++) {
        labels.push({ code: i.code, name: i.name, location: i.location, platforms: i.platforms, notes: i.notes, bagQty: bagQty > 0 ? bagQty : null });
      }
    });
    if (labels.length === 0) return;
    const html = buildPrintHtml(labels, startPos);
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
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
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
            <Label className="text-xs whitespace-nowrap">Start at slot</Label>
            <Input type="number" min="1" max="10" className="w-16" value={startPos} onChange={(e) => setStartPos(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
            <span className="text-xs text-slate-400">/ 10</span>
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
                      {i.platforms && <div className="text-[11px] text-blue-600 truncate mt-0.5">{i.platforms}</div>}
                      {i.notes && <div className="text-[11px] text-slate-500 truncate">📝 {i.notes}</div>}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 w-10">Copies</span>
                        <Input
                          ref={(el) => { qtyRefs.current[i.id] = el; }}
                          type="number"
                          min="1"
                          className="w-14 h-8 text-center text-sm"
                          value={quantities[i.id] ?? 1}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setQuantities((q) => ({ ...q, [i.id]: Math.max(1, Number(e.target.value) || 1) }))}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 w-10">Bag Qty</span>
                        <Input
                          type="number"
                          min="0"
                          placeholder="—"
                          className="w-14 h-8 text-center text-sm"
                          value={bagQuantities[i.id] ?? ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setBagQuantities((q) => ({ ...q, [i.id]: e.target.value }))}
                        />
                      </div>
                    </div>
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
            <Printer className="w-4 h-4 mr-2" /> Print {totalCount > 0 ? `(${totalCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}