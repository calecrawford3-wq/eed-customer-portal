import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RefreshCw, ExternalLink, Loader2, Plus, Package, Recycle, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_URL = "https://www.motosport.com/oem-parts";
const PART_CATEGORIES = ["block","rotating_assembly","cylinder_head","valvetrain","timing","oiling","fasteners","gaskets","seals","electrical","other"];

export default function OemPartsBrowser({ open, onOpenChange, onImported, onPick }) {
  const pickMode = !!onPick;
  const [address, setAddress] = useState(DEFAULT_URL);
  const [src, setSrc] = useState(DEFAULT_URL);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);

  const [capturing, setCapturing] = useState(false);
  const [tray, setTray] = useState([]);
  const [selected, setSelected] = useState({});
  const [importing, setImporting] = useState(null);
  const qc = useQueryClient();
  const iframeRef = useRef(null);
  const expectingLoad = useRef(false);
  const [staleUrl, setStaleUrl] = useState(false);

  const go = (url) => {
    let u = (url ?? address).trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    setSrc(u); setAddress(u); setStaleUrl(false);
    setReloadKey(k => k + 1);
    expectingLoad.current = true;
    setLoading(true);
  };
  const reload = () => { setReloadKey(k => k + 1); expectingLoad.current = true; setLoading(true); };

  const handleLoad = () => {
    setLoading(false);
    if (expectingLoad.current) { expectingLoad.current = false; setStaleUrl(false); return; }
    let url = null;
    try { url = iframeRef.current?.contentWindow?.location?.href; } catch { url = null; }
    if (url && url !== "about:blank") { setAddress(url); setStaleUrl(false); }
    else { setStaleUrl(true); }
  };

  const captureParts = async () => {
    let u = address.trim();
    if (!u) { toast.error("Enter the diagram URL in the address bar first"); return; }
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    setCapturing(true);
    try {
      const res = await base44.functions.invoke("scrapeMotosport", { url: u });
      const parts = res?.data?.parts || [];
      if (parts.length === 0) { toast.error("No parts found on that page"); return; }
      setTray(prev => [...prev, ...parts.map(p => ({
        name: p.name || "Imported part", part_number: p.part_number || "",
        price: p.price || 0, category_hint: p.category_hint, description: p.description || "", source: u,
      }))]);
      toast.success(`Captured ${parts.length} parts`);
    } catch (e) {
      toast.error("Capture failed: " + (e?.response?.data?.error || e?.message || "unknown error"));
    } finally { setCapturing(false); }
  };

  const toggle = (i) => setSelected(s => ({ ...s, [i]: !s[i] }));
  const removeFromTray = (i) => setTray(prev => prev.filter((_, idx) => idx !== i));
  const selectedCount = tray.filter((_, i) => selected[i]).length;

  const pickPart = (part) => {
    onPick(part);
    setTray([]); setSelected({});
    onOpenChange(false);
  };

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
          category: ["block","cylinder_head","rotating_assembly","crankshaft","valvetrain","timing","oiling","other"].includes(p.category_hint) ? p.category_hint : "other",
          condition: "needs_inspection", quantity_on_hand: 1,
          unit_cost: 0, sell_price: Number(p.price) || 0, core_credit: 0, status: "active",
        })));
        qc.invalidateQueries({ queryKey: ["engineCores"] });
      }
      toast.success(`Imported ${picked.length} ${type === "part" ? "part(s)" : "core(s)"}`);
      onImported?.();
      onOpenChange(false);
      setTray([]); setSelected({});
    } catch (e) {
      toast.error("Import failed: " + (e?.message || "unknown error"));
    } finally { setImporting(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[1700px] h-[94vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-base">OEM Parts Catalog — MotoSport</DialogTitle>
        </DialogHeader>

        <div className="px-4 py-2 border-b bg-slate-50 flex items-center gap-1.5">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={reload}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Input value={address} onChange={e => { setAddress(e.target.value); setStaleUrl(false); }} onKeyDown={e => { if (e.key === "Enter") go(); }} className="h-8 text-xs font-mono" />
          <Button size="sm" variant="outline" className="h-8" onClick={() => go()}>Go</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => window.open(src, "_blank")}>
            <ExternalLink className="w-3.5 h-3.5 mr-1" /> New Tab
          </Button>
        </div>

        <div className="px-4 py-2 border-b bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[10px] text-slate-400">
            {pickMode
              ? "Capture uses the address bar URL above. Load a diagram, click Capture, then click a part to fill the form."
              : "Capture uses the address bar URL above. Load a diagram, then Capture to import."}
          </p>
          <Button size="sm" className="h-8 bg-[#e20404] hover:bg-[#c00303] text-white" onClick={captureParts} disabled={capturing || staleUrl}>
            {capturing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
            Capture parts
          </Button>
          {staleUrl && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 w-full">
              You navigated inside MotoSport and its URL is hidden by the browser. Paste the diagram URL in the address bar above and press Go, then Capture parts.
            </p>
          )}
        </div>

        <div className="flex-1 min-h-0 relative bg-white">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400 mr-2" /> Loading catalog…
            </div>
          )}
          <iframe
            key={reloadKey}
            src={src}
            ref={iframeRef}
            title="MotoSport OEM Parts Catalog"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            onLoad={handleLoad}
          />
        </div>

        {tray.length > 0 && (
          <DialogFooter className="px-4 py-2 border-t bg-slate-50 flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
            <div className="max-h-32 overflow-y-auto border rounded-md bg-white">
              {tray.map((r, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 border-b last:border-0 text-xs">
                  {pickMode ? (
                    <>
                      <span className="font-mono text-slate-500 w-28 truncate">{r.part_number || "—"}</span>
                      <span className="flex-1 truncate text-slate-800">{r.name}</span>
                      {Number(r.price) > 0 && <span className="text-emerald-700 font-semibold">${Number(r.price).toFixed(2)}</span>}
                      <Button size="sm" className="h-6 px-2 bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => pickPart(r)}>
                        Use <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <input type="checkbox" checked={!!selected[i]} onChange={() => toggle(i)} className="w-3.5 h-3.5 accent-[#e20404]" />
                      <span className="font-mono text-slate-500 w-28 truncate">{r.part_number || "—"}</span>
                      <span className="flex-1 truncate text-slate-800">{r.name}</span>
                      {Number(r.price) > 0 && <span className="text-emerald-700 font-semibold">${Number(r.price).toFixed(2)}</span>}
                      <button onClick={() => removeFromTray(i)} className="text-slate-300 hover:text-[#e20404]"><X className="w-3 h-3" /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">
                {pickMode ? `${tray.length} captured · click a part to fill the form` : `${tray.length} captured · ${selectedCount} selected`}
              </span>
              {!pickMode && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50 h-8" disabled={importing !== null} onClick={() => importAs("core")}>
                    <Recycle className="w-3.5 h-3.5 mr-1" /> {importing === "core" ? "..." : "Import as Cores"}
                  </Button>
                  <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white h-8" disabled={importing !== null} onClick={() => importAs("part")}>
                    <Package className="w-3.5 h-3.5 mr-1" /> {importing === "part" ? "..." : "Import as Parts"}
                  </Button>
                </div>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}