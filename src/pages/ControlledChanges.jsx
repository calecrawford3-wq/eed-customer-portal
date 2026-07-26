import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitCompare, Loader2, CheckCircle2, XCircle, ScanSearch } from "lucide-react";
import { toast } from "sonner";

const QUAL_COLOR = (q) => (q >= 70 ? "bg-emerald-100 text-emerald-700" : q >= 45 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700");

export default function ControlledChanges() {
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);

  const { data: changes = [] } = useQuery({ queryKey: ["change-records"], queryFn: () => base44.entities.BuildChangeRecord.list("-created_date", 200) });

  const scan = async () => {
    setScanning(true);
    try {
      const res = await base44.functions.invoke("detectControlledChanges", {});
      const data = res?.data || res;
      if (data.error) { toast.error(data.error); return; }
      toast.success(`${data.created} controlled-change record(s) detected`);
      qc.invalidateQueries({ queryKey: ["change-records"] });
    } catch (e) { toast.error("Detection failed: " + (e?.message || "error")); }
    finally { setScanning(false); }
  };

  const setStatus = async (c, status) => {
    await base44.entities.BuildChangeRecord.update(c.id, { status, approved_as_controlled: status === "confirmed" });
    qc.invalidateQueries({ queryKey: ["change-records"] });
    toast.success(status === "confirmed" ? "Confirmed as controlled test" : "Rejected");
  };

  const detected = changes.filter((c) => c.status === "detected");
  const confirmed = changes.filter((c) => c.status === "confirmed");

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><GitCompare className="w-6 h-6 text-[#e20404]" /> Controlled-Change Detection</h1>
          <p className="text-slate-500 text-sm mt-0.5">Auto-detects single-variable changes between consecutive build revisions. One-variable changes with dyno pulls on both sides become high-value training data.</p>
        </div>
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={scan} disabled={scanning}>
          {scanning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scanning…</> : <><ScanSearch className="w-4 h-4 mr-2" /> Detect Changes</>}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-xs text-slate-500">Awaiting review</p><p className="text-2xl font-bold text-amber-600">{detected.length}</p></CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-xs text-slate-500">Confirmed controlled tests</p><p className="text-2xl font-bold text-emerald-600">{confirmed.length}</p></CardContent></Card>
      </div>

      <div className="space-y-2">
        {changes.map((c) => (
          <Card key={c.id} className="border-0 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{c.change_category}</Badge>
                    <span className="text-sm font-medium text-slate-900 font-mono">{c.field}</span>
                    <span className="text-xs text-slate-400">{String(c.previous_value)} → {String(c.new_value)}</span>
                    {c.one_variable ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">1 variable</Badge> : <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">{c.variables_changed} variables</Badge>}
                    <Badge className={`text-[10px] border-0 ${QUAL_COLOR(c.test_quality_score)}`}>test quality {c.test_quality_score}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{c.notes}</p>
                </div>
                {c.status === "detected" ? (
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 text-emerald-600" onClick={() => setStatus(c, "confirmed")}><CheckCircle2 className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => setStatus(c, "rejected")}><XCircle className="w-4 h-4" /></Button>
                  </div>
                ) : <Badge className={`text-[10px] border-0 ${c.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{c.status}</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
        {changes.length === 0 && <p className="text-center text-slate-400 py-12 text-sm">No changes detected yet. Run detection to scan consecutive build revisions. Build and revise engines first, then re-run — duplicates are prevented.</p>}
      </div>
    </div>
  );
}