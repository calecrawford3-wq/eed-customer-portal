import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, FlaskConical, Database, Activity, AlertTriangle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import SimulationSetup from "@/components/simulator/SimulationSetup";
import SimulationResults from "@/components/simulator/SimulationResults";

const CONF_COLOR = { high: "bg-emerald-100 text-emerald-700", medium: "bg-amber-100 text-amber-700", low: "bg-orange-100 text-orange-700", insufficient: "bg-red-100 text-red-700" };

export default function Simulator() {
  const qc = useQueryClient();
  const [setupOpen, setSetupOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [viewSim, setViewSim] = useState(null);
  const [prepRunning, setPrepRunning] = useState(false);
  const [prepCounts, setPrepCounts] = useState(null);

  const params = new URLSearchParams(window.location.search);
  const presetBuildId = params.get("buildId");

  const { data: simulations = [], isLoading } = useQuery({
    queryKey: ["simulations"],
    queryFn: () => base44.entities.Simulation.list("-created_date", 50),
  });
  const { data: dynoPulls = [] } = useQuery({
    queryKey: ["sim-pulls"],
    queryFn: () => base44.entities.DynoPull.list("-created_date", 50),
  });
  const { data: devSources = [] } = useQuery({
    queryKey: ["sim-devsources"],
    queryFn: () => base44.entities.DevelopmentDataSource.list("-created_date", 50),
  });

  const validated = simulations.filter((s) => s.validated);
  const accuracy = useMemo(() => {
    if (!validated.length) return null;
    const errs = validated.map((s) => {
      try { const v = JSON.parse(s.validation_error || "{}"); return Math.abs(Number(v.peak_hp_error_pct) || 0); } catch { return 0; }
    });
    const avg = errs.reduce((a, b) => a + b, 0) / errs.length;
    return { avg, count: validated.length };
  }, [validated]);

  const awaitingValidation = simulations.filter((s) => !s.validated && s.confidence !== "insufficient");
  const approvedTraining = dynoPulls.filter((p) => p.is_approved_for_training).length + devSources.filter((s) => s.training_status === "approved_for_training").length;
  const reviewNeeded = dynoPulls.filter((p) => p.training_status === "not_reviewed" || p.training_status === "incomplete").length + devSources.filter((s) => s.training_status === "not_reviewed").length;

  const runPrep = async () => {
    setPrepRunning(true);
    try {
      const res = await base44.functions.invoke("prepareHistoricalData", {});
      const data = res?.data || res;
      if (data.error) { toast.error(data.error); return; }
      setPrepCounts(data.counts);
      toast.success(`Historical data prepared — ${data.revisions_created} revision snapshots indexed`);
      qc.invalidateQueries({ queryKey: ["simulations"] });
    } catch (e) {
      toast.error("Preparation failed: " + (e?.message || "error"));
    } finally {
      setPrepRunning(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><FlaskConical className="w-6 h-6 text-[#e20404]" /> Engine Development Simulator</h1>
          <p className="text-slate-500 text-sm mt-0.5">Predict torque &amp; horsepower curves from build changes — an engineering decision-support layer over your existing build data.</p>
        </div>
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => setSetupOpen(true)}>
          <Sparkles className="w-4 h-4 mr-2" /> New Simulation
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-0 shadow-sm"><CardContent className="p-4">
          <p className="text-xs text-slate-500">Simulations run</p>
          <p className="text-2xl font-bold text-slate-900">{simulations.length}</p>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4">
          <p className="text-xs text-slate-500">Awaiting dyno validation</p>
          <p className="text-2xl font-bold text-amber-600">{awaitingValidation.length}</p>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4">
          <p className="text-xs text-slate-500">Approved training records</p>
          <p className="text-2xl font-bold text-emerald-600">{approvedTraining}</p>
          {reviewNeeded > 0 && <p className="text-xs text-amber-600">{reviewNeeded} need review</p>}
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4">
          <p className="text-xs text-slate-500">Prediction accuracy</p>
          {accuracy ? <p className="text-2xl font-bold text-slate-900">±{accuracy.avg.toFixed(1)}% <span className="text-sm text-slate-400">({accuracy.count})</span></p> : <p className="text-sm text-slate-400 mt-1">No validated runs yet</p>}
        </CardContent></Card>
      </div>

      <Tabs defaultValue="recent">
        <TabsList className="mb-4">
          <TabsTrigger value="recent">Recent Simulations</TabsTrigger>
          <TabsTrigger value="data">Data Foundation</TabsTrigger>
        </TabsList>

        <TabsContent value="recent">
          {isLoading ? <p className="text-slate-400 text-sm">Loading…</p> : simulations.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No simulations yet. Start a new one from an existing build.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {simulations.map((s) => (
                <button key={s.id} onClick={() => setViewSim(s)} className="w-full text-left bg-white border border-slate-200 rounded-lg p-3 hover:border-[#e20404] transition flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-slate-900 truncate">{s.name}</span>
                      <Badge className={`${CONF_COLOR[s.confidence] || ""} border-0 text-[10px]`}>{s.confidence}</Badge>
                      {s.validated && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">Validated</Badge>}
                    </div>
                    <p className="text-xs text-slate-500">{s.engine_serial_number}{s.eed_id ? ` · ${s.eed_id}` : ""} · {s.predicted_peak_hp} hp @ {s.predicted_peak_hp_rpm} RPM</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="data">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Database className="w-4 h-4 text-slate-500" /> Prepare Historical Simulator Data</CardTitle>
                <Button size="sm" variant="outline" onClick={runPrep} disabled={prepRunning}>
                  <Activity className="w-3.5 h-3.5 mr-1" /> {prepRunning ? "Scanning…" : "Run Preparation"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-500 mb-3">Scans existing customers, engines, builds, build sheets, machining records, and dyno records to build searchable index snapshots — without modifying your original records. Rerunning won't create duplicates.</p>
              {prepCounts ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(prepCounts).map(([k, v]) => (
                    <div key={k} className="bg-slate-50 rounded p-2 border border-slate-100">
                      <p className="text-[11px] text-slate-400 capitalize">{k.replace(/_/g, " ")}</p>
                      <p className="text-lg font-bold text-slate-900">{v}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Run preparation to index existing builds as simulation baselines.</p>
              )}
              {reviewNeeded > 0 && (
                <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded p-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{reviewNeeded} record(s) awaiting review before they can be approved for training.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SimulationSetup open={setupOpen} onClose={() => setSetupOpen(false)} presetBuildId={presetBuildId} onResult={(data) => {
        base44.entities.Simulation.list("-created_date", 1).then((latest) => setResult(latest[0] || data));
      }} />
      <SimulationResults simulation={viewSim || result} onClose={() => { setViewSim(null); setResult(null); }} />
    </div>
  );
}