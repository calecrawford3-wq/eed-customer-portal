import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import DemoStepper from "./DemoStepper";
import DemoSuccess from "./DemoSuccess";
import { STEP_COMPONENTS } from "./demoStepComponents";
import { DEMO_STEPS, isDone, stepIndex } from "@/lib/demoSteps";

// The deposit path of the normal offer page, run as a realistic end-to-end
// walkthrough of the test offer. It is only ever shown to an authenticated
// admin, only for the test offer, and every write goes to the isolated
// EngineAssistanceDemoSession record through the existing backend function —
// never to the real offer, loan, agreement, identity, payment, ledger, job or
// collections records. Everyone else gets `fallback`, the untouched
// production deposit gates.
export default function InlineTestJourney({ offer, fallback }) {
  const qc = useQueryClient();
  const queryKey = useMemo(() => ["assistance-demo-inline", offer?.id], [offer?.id]);
  const [isAdmin, setIsAdmin] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewStep, setViewStep] = useState("");
  const tokenRef = useRef("");
  const planSent = useRef(false);

  useEffect(() => {
    let live = true;
    base44.auth.me()
      .then((user) => { if (live) setIsAdmin(user?.role === "admin"); })
      .catch(() => { if (live) setIsAdmin(false); });
    return () => { live = false; };
  }, []);

  const { data: demo, isLoading, refetch } = useQuery({
    queryKey,
    enabled: isAdmin === true && !!offer?.id,
    queryFn: async () => {
      const resumed = await base44.functions.invoke("engineAssistanceDemo", { action: "resume", offer_id: offer.id });
      if (resumed.data?.token) {
        tokenRef.current = resumed.data.token;
        return resumed.data.demo;
      }
      const created = await base44.functions.invoke("engineAssistanceDemo", { action: "create", offer_id: offer.id });
      if (created.data?.error) throw new Error(created.data.error);
      tokenRef.current = created.data.token;
      return created.data.demo;
    },
    retry: false,
  });

  const submit = useCallback(async (step, payload) => {
    if (!tokenRef.current) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("engineAssistanceDemo", { token: tokenRef.current, action: "step", step, payload });
      if (res.data?.error) throw new Error(res.data.error);
      qc.setQueryData(queryKey, res.data.demo);
    } catch (error) {
      toast.error(error?.message || "That step could not be completed");
      await refetch();
    } finally {
      setBusy(false);
    }
  }, [qc, queryKey, refetch]);

  const restart = async () => {
    if (!tokenRef.current) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("engineAssistanceDemo", { token: tokenRef.current, action: "restart" });
      if (res.data?.error) throw new Error(res.data.error);
      qc.setQueryData(queryKey, res.data.demo);
      setViewStep(res.data.demo?.current_step || "plan");
      planSent.current = false;
    } catch (error) {
      toast.error(error?.message || "The test could not be restarted");
    } finally {
      setBusy(false);
    }
  };

  // Choosing this plan on the previous screen is the plan choice.
  useEffect(() => {
    if (!demo || planSent.current) return;
    if (isDone(demo, "plan")) { planSent.current = true; return; }
    if (demo.current_step !== "plan") return;
    planSent.current = true;
    submit("plan", { plan: "deposit_internal" });
  }, [demo, submit]);

  useEffect(() => {
    if (demo?.current_step) setViewStep(demo.current_step);
  }, [demo?.current_step]);

  if (isAdmin === false) return fallback;

  if (isAdmin === null || isLoading) {
    return (
      <Card><CardContent className="flex items-center gap-2 p-4 text-sm text-slate-500 sm:p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Preparing your deposit plan…
      </CardContent></Card>
    );
  }

  if (!demo) {
    return (
      <div className="space-y-2">
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          The test walkthrough could not be prepared, so the live gates are shown.
        </p>
        {fallback}
      </div>
    );
  }

  const activeStep = viewStep || demo.current_step || "plan";
  const completed = demo.status === "completed";
  const declared = demo.status === "declined";
  const StepComponent = STEP_COMPONENTS[activeStep] || STEP_COMPONENTS.plan;
  const previous = stepIndex(activeStep) > 0 ? DEMO_STEPS[stepIndex(activeStep) - 1].key : "";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-700" />
        <p className="text-[11px] font-medium leading-snug text-amber-900">
          TEST MODE — simulated steps for offer {demo.offer_number}. Nothing is charged, verified, signed into effect or financed, and no real account data is collected.
        </p>
      </div>

      {completed ? (
        <DemoSuccess demo={demo} busy={busy} onRestart={restart} isAdmin />
      ) : (
        <>
          <DemoStepper demo={demo} viewStep={activeStep} onSelect={setViewStep} />
          <div className="flex items-center justify-between gap-2">
            {previous ? (
              <Button variant="ghost" size="sm" className="-ml-2" disabled={busy} onClick={() => setViewStep(previous)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            ) : <span />}
            <p className="text-[11px] text-slate-500">Step {stepIndex(activeStep) + 1} of {DEMO_STEPS.length}</p>
          </div>
          <StepComponent demo={demo} busy={busy} isAdmin onSubmit={submit} onRefresh={refetch} />
          {declared && (
            <Button variant="outline" className="w-full" disabled={busy} onClick={restart}>
              <RotateCcw className="h-4 w-4" /> Restart the test walkthrough
            </Button>
          )}
        </>
      )}
    </div>
  );
}