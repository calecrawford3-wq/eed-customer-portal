import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Loader2, Recycle, Package, FileText, Link2 } from "lucide-react";
import { toast } from "sonner";

const PART_CATEGORIES = ["block","rotating_assembly","cylinder_head","valvetrain","timing","oiling","fasteners","gaskets","seals","electrical","other"];
const CORE_CAT_MAP = { block:"block", cylinder_head:"cylinder_head", rotating_assembly:"rotating_assembly", crankshaft:"crankshaft", valvetrain:"valvetrain", timing:"timing", oiling:"oiling", fasteners:"other", gaskets:"other", seals:"other", electrical:"other", other:"other" };

export default function PartzillaBrowseButton({ label = "Browse Catalog", size = "sm", className = "", onImported }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState({});
  const [loadingUrl, setLoadingUrl] = useState(null);
  const [importing, setImporting] = useState(null);
  const [manualUrl, setManualUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const qc = useQueryClient();

  const reset = () => { setRows([]); setSelected({}); setQuery(""); setManualUrl(""); };

  const doSearch = async () => {
    if (!query.trim()) { toast.error("Enter a part number or make/model/year"); return; }
    setSearching(true); setRows([]); setSelected({});
    try {
      const res = await base44.functions.invoke("searchPartzilla", { query: query.trim() });
      const r = res?.data?.results || [];
      setRows(r);
      if (r.length === 0) toast.error("No results — try a different part number or model");
      else toast.success(`Found ${r.length} result(s)`);
    } catch (e) {
      toast.error("Search failed: " + (e?.message || "unknown error"));
    } finally { setSearching(false); }
  };

  const mergeParts = (parts) => parts.map(p => ({
    name: p.name, part_number: p.part_number, price: p.price, url: "", type: "part", category_hint: p.category_hint,
  }));

  const loadPageParts = async (rowIdx) => {
    const row = rows[rowIdx];
    if (!row?.url) return;
    setLoadingUrl(row.url);
    try {
      const res = await base44.functions.invoke("scrapePartzilla", { url: row.url });
      const parts = res?.data?.parts || [];
      if (parts.length === 0) { toast.error("No parts found on that page"); return; }
      setRows(prev => [...prev.slice(0, rowIdx), ...mergeParts(parts), ...prev.slice(rowIdx + 1)]);
      toast.success(`Loaded ${parts.length} parts`);
    } catch (e) {
      toast.error("Capture failed: " + (e?.message || "unknown error"));
    } finally { setLoadingUrl(null); }
  };

  const captureManual = async () => {
    if (!manualUrl.trim()) { toast.error("Paste a Partzilla URL"); return; }
    setFetching(true);
    try {
      const res = await base44.functions.invoke("scrapePartzilla", { url: manualUrl.trim() });
      const parts = res?.data?.parts || [];
      if (parts.length === 0) { toast.error("No parts found on that page"); return; }
      setRows(prev => [...prev, ...mergeParts(parts)]);
      toast.success(`Loaded ${parts.length} parts`);
    } catch (e) {
      toast.error("Capture failed: " + (e?.message || "unknown error"));
    } finally { setFetching(false); }
  };

  const toggle = (i) => setSelected(s => ({ ...s, [i]: !s[i] }));
  const partRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.type === "part");
  const selectedCount = partRows.filter(({ i }) => selected[i]).length;

  const importAs = async (type) => {
    const picked = partRows.filter(({ i }) => selected[i]).map(({ r }) => r);
    if (picked.length === 0) { toast.error("Select at least one part"); return; }
    setImporting(type);
    try {
      if (type === "part") {
        await base44.entities.Part.bulkCreate(picked.map(p => ({
          part_number: p.part_number || "",
          name: p.name || "Imported part",
          category: PART_CATEGORIES.includes(p.category_hint) ? p.category_hint : "other",
          unit_cost: 0,
          sell_price: Number(p.price) || 0,
          status: "active",
        })));
        qc.invalidateQueries({ queryKey: ["parts"] });
      } else {
        await base44.entities.EngineCore.bulkCreate(picked.map(p => ({
          core_number: p.part_number || "",
          name: p.name || "Imported core",
          category: CORE_CAT_MAP[p.category_hint] || "other",
          condition: "needs_inspection",
          quantity_on_hand: 1,
          unit_cost: 0,
          sell_price: Number(p.price) || 0,
          core_credit: 0,
          status: "active",
        })));
        qc.invalidateQueries({ queryKey: ["engineCores"] });
      }
      toast.success(`Imported ${picked.length} ${type === "part" ? "part(s)" : "core(s)"}`);
      onImported?.();
      setOpen(false); reset();
    } catch (e) {
      toast.error("Import failed: " + (e?.message || "unknown error"));
    } finally { setImporting(null); }
  };

  return (
    <>
      <Button type="button" variant="outline" size={size} className={className} onClick={() => setOpen(true)}>
        <Search className="w-3.5 h-3.5 mr-1.5" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Search Partzilla Catalog</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
                placeholder="Part number, or make/model/year (e.g. 1979 Honda CB125S)"
              />
              <Button onClick={doSearch} disabled={searching} className="bg-[#e20404] hover:bg-[#c00303] text-white whitespace-nowrap">
                {searching ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Searching...</> : <><Search className="w-3.5 h-3.5 mr-1.5" /> Search</>}
              </Button>
            </div>
            <p className="text-xs text-slate-400 -mt-1">Tip: a result tagged "page" lists many parts — click <span className="font-medium">Load parts</span> to expand them.</p>

            {rows.length > 0 && (
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                {rows.map((r, i) => r.type === "page" ? (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-0 bg-amber-50/40">
                    <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{r.name || "Catalog page"}</p>
                      <p className="text-xs text-slate-400 truncate">{r.url}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={loadingUrl === r.url} onClick={() => loadPageParts(i)} className="h-7">
                      {loadingUrl === r.url ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                      {loadingUrl === r.url ? "Loading..." : "Load parts"}
                    </Button>
                  </div>
                ) : (
                  <label key={i} className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={!!selected[i]} onChange={() => toggle(i)} className="w-4 h-4 accent-[#e20404]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{r.name || "(no name)"}</p>
                      <p className="text-xs text-slate-500 font-mono">{r.part_number || "—"}</p>
                    </div>
                    <div className="text-right">
                      {Number(r.price) > 0 && <p className="text-sm font-semibold text-emerald-700">${Number(r.price).toFixed(2)}</p>}
                      {r.category_hint && <p className="text-[10px] text-slate-400 capitalize">{r.category_hint.replace("_", " ")}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="pt-2 border-t">
              <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Link2 className="w-3 h-3" /> Or paste a Partzilla URL directly</p>
              <div className="flex gap-2">
                <Input value={manualUrl} onChange={e => setManualUrl(e.target.value)} placeholder="https://www.partzilla.com/catalog/..." />
                <Button variant="outline" onClick={captureManual} disabled={fetching} className="whitespace-nowrap">
                  {fetching ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Capturing...</> : "Capture"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Close</Button>
            {partRows.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50" disabled={importing !== null} onClick={() => importAs("core")}>
                  <Recycle className="w-3.5 h-3.5 mr-1.5" /> {importing === "core" ? "Importing..." : `Import ${selectedCount} as Cores`}
                </Button>
                <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" disabled={importing !== null} onClick={() => importAs("part")}>
                  <Package className="w-3.5 h-3.5 mr-1.5" /> {importing === "part" ? "Importing..." : `Import ${selectedCount} as Parts`}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}