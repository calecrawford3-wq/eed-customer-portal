import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExternalLink, Search, Loader2, Recycle, Package } from "lucide-react";
import { toast } from "sonner";

const PARTZILLA_URL = "https://www.partzilla.com/catalog";

const PART_CATEGORIES = ["block","rotating_assembly","cylinder_head","valvetrain","timing","oiling","fasteners","gaskets","seals","electrical","other"];
const CORE_CAT_MAP = { block:"block", cylinder_head:"cylinder_head", rotating_assembly:"rotating_assembly", crankshaft:"crankshaft", valvetrain:"valvetrain", timing:"timing", oiling:"oiling", fasteners:"other", gaskets:"other", seals:"other", electrical:"other", other:"other" };

export default function PartzillaBrowseButton({ label = "Browse Catalog", size = "sm", className = "", onImported }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState({});
  const [importing, setImporting] = useState(null);
  const qc = useQueryClient();

  const capture = async () => {
    if (!url.trim()) { toast.error("Paste a Partzilla product or diagram URL"); return; }
    setFetching(true);
    setResults([]);
    setSelected({});
    try {
      const res = await base44.functions.invoke("scrapePartzilla", { url: url.trim() });
      const parts = res?.data?.parts || [];
      if (parts.length === 0) {
        toast.error("No parts found — try a specific model/diagram page that lists parts");
      } else {
        toast.success(`Found ${parts.length} part(s)`);
      }
      setResults(parts);
    } catch (e) {
      toast.error("Capture failed: " + (e?.message || "unknown error"));
    } finally {
      setFetching(false);
    }
  };

  const toggle = (i) => setSelected(s => ({ ...s, [i]: !s[i] }));
  const selectedCount = results.filter((_, i) => selected[i]).length;

  const importAs = async (type) => {
    const picked = results.filter((_, i) => selected[i]);
    if (picked.length === 0) { toast.error("Select at least one part"); return; }
    setImporting(type);
    try {
      if (type === "part") {
        await base44.entities.Part.bulkCreate(picked.map(p => ({
          part_number: p.part_number || "",
          name: p.name || "Imported part",
          description: p.description || "",
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
          description: p.description || "",
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
      setOpen(false);
      setResults([]); setSelected({}); setUrl("");
    } catch (e) {
      toast.error("Import failed: " + (e?.message || "unknown error"));
    } finally {
      setImporting(null);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size={size} className={className} onClick={() => setOpen(true)}>
        <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Browse Partzilla & Capture Parts</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto">
            <div className="border rounded-lg bg-slate-50 p-6 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#e20404]/10 flex items-center justify-center">
                <ExternalLink className="w-6 h-6 text-[#e20404]" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Partzilla blocks in-app embedding</p>
                <p className="text-xs text-slate-500 mt-1">Open the catalog in a new tab, find your model/diagram page, copy its URL, then paste it below to capture the parts.</p>
              </div>
              <a href={PARTZILLA_URL} target="_blank" rel="noopener noreferrer">
                <Button type="button" variant="outline" size="sm">Open Partzilla Catalog ↗</Button>
              </a>
            </div>
            <div className="flex gap-2">
              <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste Partzilla product/diagram URL (e.g. .../catalog/honda/motorcycle/.../model)" />
              <Button onClick={capture} disabled={fetching} className="bg-[#e20404] hover:bg-[#c00303] text-white whitespace-nowrap">
                {fetching ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Capturing...</> : <><Search className="w-3.5 h-3.5 mr-1.5" /> Capture Parts</>}
              </Button>
            </div>
            {results.length > 0 && (
              <div className="border rounded-lg max-h-52 overflow-y-auto">
                {results.map((p, i) => (
                  <label key={i} className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={!!selected[i]} onChange={() => toggle(i)} className="w-4 h-4 accent-[#e20404]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{p.name || "(no name)"}</p>
                      <p className="text-xs text-slate-500 font-mono">{p.part_number || "—"}</p>
                    </div>
                    <div className="text-right">
                      {Number(p.price) > 0 && <p className="text-sm font-semibold text-emerald-700">${Number(p.price).toFixed(2)}</p>}
                      {p.category_hint && <p className="text-[10px] text-slate-400 capitalize">{p.category_hint.replace("_"," ")}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            {results.length > 0 && (
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