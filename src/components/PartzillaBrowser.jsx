import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, ArrowRight, Home, Search, Loader2, Package, Recycle, Plus, X } from "lucide-react";
import { toast } from "sonner";

const PART_CATEGORIES = ["block","rotating_assembly","cylinder_head","valvetrain","timing","oiling","fasteners","gaskets","seals","electrical","other"];
const CORE_CAT_MAP = { block:"block", cylinder_head:"cylinder_head", rotating_assembly:"rotating_assembly", crankshaft:"crankshaft", valvetrain:"valvetrain", timing:"timing", oiling:"oiling", fasteners:"other", gaskets:"other", seals:"other", electrical:"other", other:"other" };
const HOME_URL = "https://www.partzilla.com/catalog";

export default function PartzillaBrowser({ open, onOpenChange, onImported }) {
  const [history, setHistory] = useState([HOME_URL]);
  const [hidx, setHidx] = useState(0);
  const currentUrl = history[hidx];

  const [address, setAddress] = useState(HOME_URL);
  const [markdown, setMarkdown] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);

  const [tray, setTray] = useState([]);
  const [selected, setSelected] = useState({});
  const [capturing, setCapturing] = useState(false);
  const [importing, setImporting] = useState(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setAddress(currentUrl);
    setLoading(true); setError(""); setMarkdown(""); setTitle("");
    base44.functions.invoke("browsePartzilla", { url: currentUrl })
      .then(res => {
        setMarkdown(res?.data?.markdown || "");
        setTitle(res?.data?.title || currentUrl);
        if (!res?.data?.markdown) setError("No readable content on this page.");
      })
      .catch(e => setError(e?.response?.data?.error || e?.message || "Failed to load page"))
      .finally(() => setLoading(false));
  }, [currentUrl, open]);

  const navigate = useCallback((url) => {
    let u = url;
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) {
      try { u = new URL(u, currentUrl).href; } catch { return; }
    }
    if (!/partzilla\.com/i.test(u)) return;
    setHistory(h => [...h.slice(0, hidx + 1), u]);
    setHidx(i => i + 1);
    setResults([]);
  }, [currentUrl, hidx]);

  const back = () => setHidx(i => Math.max(0, i - 1));
  const forward = () => setHidx(i => Math.min(history.length - 1, i + 1));
  const goHome = () => navigate(HOME_URL);
  const goAddress = () => { if (address !== currentUrl) navigate(address); };

  const doSearch = async () => {
    if (!query.trim()) { toast.error("Enter a part number or make/model/year"); return; }
    setSearching(true); setResults([]);
    try {
      const res = await base44.functions.invoke("searchPartzilla", { query: query.trim() });
      const r = res?.data?.results || [];
      setResults(r);
      if (r.length === 0) toast.error("No results — try different terms");
    } catch (e) {
      toast.error("Search failed: " + (e?.message || "unknown error"));
    } finally { setSearching(false); }
  };

  const capturePage = async () => {
    setCapturing(true);
    try {
      const res = await base44.functions.invoke("scrapePartzilla", { url: currentUrl });
      const parts = res?.data?.parts || [];
      if (parts.length === 0) { toast.error("No parts found on this page"); return; }
      const newRows = parts.map(p => ({
        name: p.name || "Imported part", part_number: p.part_number || "",
        price: p.price || 0, category_hint: p.category_hint, source: currentUrl,
      }));
      setTray(prev => [...prev, ...newRows]);
      toast.success(`Captured ${parts.length} parts from this page`);
    } catch (e) {
      toast.error("Capture failed: " + (e?.response?.data?.error || e?.message || "unknown error"));
    } finally { setCapturing(false); }
  };

  const toggle = (i) => setSelected(s => ({ ...s, [i]: !s[i] }));
  const removeFromTray = (i) => setTray(prev => prev.filter((_, idx) => idx !== i));
  const selectedCount = tray.filter((_, i) => selected[i]).length;

  const importAs = async (type) => {
    const picked = tray.filter((_, i) => selected[i]);
    if (picked.length === 0) { toast.error("Select at least one part"); return; }
    setImporting(type);
    try {
      if (type === "part") {
        await base44.entities.Part.bulkCreate(picked.map(p => ({
          part_number: p.part_number, name: p.name,
          category: PART_CATEGORIES.includes(p.category_hint) ? p.category_hint : "other",
          unit_cost: 0, sell_price: Number(p.price) || 0, status: "active",
        })));
        qc.invalidateQueries({ queryKey: ["parts"] });
      } else {
        await base44.entities.EngineCore.bulkCreate(picked.map(p => ({
          core_number: p.part_number, name: p.name,
          category: CORE_CAT_MAP[p.category_hint] || "other",
          condition: "needs_inspection", quantity_on_hand: 1,
          unit_cost: 0, sell_price: Number(p.price) || 0, core_credit: 0, status: "active",
        })));
        qc.invalidateQueries({ queryKey: ["engineCores"] });
      }
      toast.success(`Imported ${picked.length} ${type === "part" ? "part(s)" : "core(s)"}`);
      onImported?.();
      onOpenChange(false);
      setTray([]); setSelected({}); setHistory([HOME_URL]); setHidx(0);
    } catch (e) {
      toast.error("Import failed: " + (e?.message || "unknown error"));
    } finally { setImporting(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            Partzilla Catalog Browser
            <span className="text-xs font-normal text-slate-400 truncate">{title}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="px-4 py-2 border-b bg-slate-50 space-y-2">
          <div className="flex items-center gap-1.5">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={back} disabled={hidx === 0}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={forward} disabled={hidx >= history.length - 1}>
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={goHome}>
              <Home className="w-4 h-4" />
            </Button>
            <Input
              value={address}
              onChange={e => setAddress(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") goAddress(); }}
              className="h-8 text-xs font-mono"
            />
            <Button size="sm" variant="outline" className="h-8" onClick={goAddress}>Go</Button>
            <Button size="sm" variant="outline" className="h-8 border-[#e20404] text-[#e20404] hover:bg-[#e20404]/5" onClick={capturePage} disabled={capturing || loading}>
              {capturing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Capture parts
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
              placeholder="Search to jump: part # or make/model/year"
              className="h-8 text-xs"
            />
            <Button size="sm" className="h-8 bg-[#e20404] hover:bg-[#c00303] text-white" onClick={doSearch} disabled={searching}>
              {searching ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1" />}
              Search
            </Button>
          </div>
          {results.length > 0 && (
            <div className="border rounded-md bg-white max-h-40 overflow-y-auto">
              {results.map((r, i) => (
                <button key={i} onClick={() => navigate(r.url)} className="block w-full text-left px-3 py-1.5 border-b last:border-0 hover:bg-slate-50">
                  <span className="text-xs font-medium text-slate-800">{r.name}</span>
                  <span className="block text-[10px] text-slate-400 font-mono truncate">{r.url}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Page content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 bg-white">
          {loading && (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading page...
            </div>
          )}
          {error && !loading && (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-500 mb-2">{error}</p>
              <Button size="sm" variant="outline" onClick={() => navigate(currentUrl)}>Retry</Button>
            </div>
          )}
          {!loading && !error && markdown && (
            <div className="prose prose-sm max-w-none prose-headings:text-slate-900 prose-a:text-[#e20404] prose-img:rounded">
              <ReactMarkdown
                components={{
                  a: ({ href, children, ...props }) => {
                    const isPz = href && /partzilla\.com/i.test(href);
                    return (
                      <a
                        href={isPz ? "#" : href}
                        target={isPz ? undefined : "_blank"}
                        rel="noopener noreferrer"
                        onClick={e => { if (isPz) { e.preventDefault(); navigate(href); } }}
                        {...props}
                      >{children}</a>
                    );
                  },
                  img: ({ src, ...props }) => (
                    <img src={src} referrerPolicy="no-referrer" loading="lazy" className="max-w-full h-auto" {...props} />
                  ),
                }}
              >{markdown}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Tray footer */}
        {tray.length > 0 && (
          <DialogFooter className="px-4 py-2 border-t bg-slate-50 flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
            <div className="max-h-28 overflow-y-auto border rounded-md bg-white">
              {tray.map((r, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 border-b last:border-0 text-xs">
                  <input type="checkbox" checked={!!selected[i]} onChange={() => toggle(i)} className="w-3.5 h-3.5 accent-[#e20404]" />
                  <span className="font-mono text-slate-500 w-28 truncate">{r.part_number || "—"}</span>
                  <span className="flex-1 truncate text-slate-800">{r.name}</span>
                  {Number(r.price) > 0 && <span className="text-emerald-700 font-semibold">${Number(r.price).toFixed(2)}</span>}
                  <button onClick={() => removeFromTray(i)} className="text-slate-300 hover:text-[#e20404]"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">{tray.length} captured · {selectedCount} selected</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50 h-8" disabled={importing !== null} onClick={() => importAs("core")}>
                  <Recycle className="w-3.5 h-3.5 mr-1" /> {importing === "core" ? "..." : "Import as Cores"}
                </Button>
                <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white h-8" disabled={importing !== null} onClick={() => importAs("part")}>
                  <Package className="w-3.5 h-3.5 mr-1" /> {importing === "part" ? "..." : "Import as Parts"}
                </Button>
              </div>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}