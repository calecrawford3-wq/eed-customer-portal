import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, ExternalLink, Loader2 } from "lucide-react";

const DEFAULT_URL = "https://www.motosport.com/oem-parts";

export default function OemPartsBrowser({ open, onOpenChange }) {
  const [address, setAddress] = useState(DEFAULT_URL);
  const [src, setSrc] = useState(DEFAULT_URL);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);

  const go = () => {
    let u = address.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    setSrc(u);
    setReloadKey(k => k + 1);
    setLoading(true);
  };
  const reload = () => { setReloadKey(k => k + 1); setLoading(true); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-base">OEM Parts Catalog — MotoSport</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-2 border-b bg-slate-50 flex items-center gap-1.5">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={reload}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Input value={address} onChange={e => setAddress(e.target.value)} onKeyDown={e => { if (e.key === "Enter") go(); }} className="h-8 text-xs font-mono" />
          <Button size="sm" variant="outline" className="h-8" onClick={go}>Go</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => window.open(src, "_blank")}>
            <ExternalLink className="w-3.5 h-3.5 mr-1" /> New Tab
          </Button>
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
            title="MotoSport OEM Parts Catalog"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            onLoad={() => setLoading(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}