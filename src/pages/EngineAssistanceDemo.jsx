import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PublicAssistanceShell from "@/components/assistance/PublicAssistanceShell";
import DemoBanner from "@/components/assistance/demo/DemoBanner";
import DemoStepper from "@/components/assistance/demo/DemoStepper";
import DemoAdminControls from "@/components/assistance/demo/DemoAdminControls";
import DemoSuccess from "@/components/assistance/demo/DemoSuccess";
import DemoStepPlan from "@/components/assistance/demo/DemoStepPlan";
import DemoStepIdentity from "@/components/assistance/demo/DemoStepIdentity";
import DemoStepFinancing from "@/components/assistance/demo/DemoStepFinancing";
import DemoStepApproval from "@/components/assistance/demo/DemoStepApproval";
import DemoStepAgreement from "@/components/assistance/demo/DemoStepAgreement";
import DemoStepAutopay from "@/components/assistance/demo/DemoStepAutopay";
import DemoStepDeposit from "@/components/assistance/demo/DemoStepDeposit";
import DemoLoanDashboard from "@/components/assistance/demo/DemoLoanDashboard";
import { DEMO_STEPS, stepIndex } from "@/lib/demoSteps";

const STEP_COMPONENTS = {
  plan: DemoStepPlan,
  identity: DemoStepIdentity,
  financing: DemoStepFinancing,
  approval: DemoStepApproval,
  agreement: DemoStepAgreement,
  autopay: DemoStepAutopay,
  deposit: DemoStepDeposit,
  dashboard: DemoLoanDashboard,
};

// Token-scoped, isolated test walkthrough. Opening this link cannot touch live
// financing, payments, identity or agreements: the server only reads/writes the
// demo session, and the simulated review itself requires an authenticated admin.
export default function EngineAssistanceDemo() {
  const { token } = useParams();
  const qc = useQueryClient();
  const [viewStep, setViewStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let live = true;
    base44.auth.me()
      .then((user) => { if (live) setIsAdmin(user?.role === "admin"); })
      .catch(() => { if (live) setIsAdmin(false); });
    return () => { live = false; };
  }, []);

  const { data: demo, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["assistance-demo", token],
    queryFn: async () => {
      const res = await base44.functions.invoke("engineAssistanceDemo", { token, action: "get" });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data.demo;
    },
    retry: false,
  });

  useEffect(() => {
    if (demo?.current_step) setViewStep(demo.current_step);
  }, [demo?.current_step]);

  const submit = async (step, payload) => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("engineAssistanceDemo", { token, action: "step", step, payload });
      if (res.data?.error) throw new Error(res.data.error);
      qc.setQueryData(["assistance-demo", token], res.data.demo);
      if (res.data.already_complete) toast.info("That step is already complete in this test.");
    } catch (err) {
      toast.error(err?.message || "That test step could not be completed");
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  const restart = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("engineAssistanceDemo", { token, action: "restart" });
      if (res.data?.error) throw new Error(res.data.error);
      qc.setQueryData(["assistance-demo", token], res.data.demo);
      setViewStep(res.data.demo?.current_step || "plan");
      toast.success("Test walkthrough restarted");
    } catch (err) {
      toast.error(err?.message || "The test could not be restarted");
    } finally {
      setBusy(false);
    }
  };

  const activeStep = viewStep || demo?.current_step || "plan";

  const previousStep = useMemo(() => {
    const index = stepIndex(activeStep);
    return index > 0 ? DEMO_STEPS[index - 1].key : "";
  }, [activeStep]);

  if (isLoading) {
    return (
      <PublicAssistanceShell title="Test walkthrough">
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading the test walkthrough…</div>
      </PublicAssistanceShell>
    );
  }

  if (isError || !demo) {
    return (
      <PublicAssistanceShell title="Test walkthrough unavailable">
        <Card><CardContent className="flex items-start gap-3 p-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
          <div>
            <p className="font-medium text-slate-900">{error?.message || "This test link is not valid."}</p>
            <p className="mt-1 text-sm text-slate-600">Test walkthroughs are started by an Elite admin and the link cannot be guessed.</p>
          </div>
        </CardContent></Card>
      </PublicAssistanceShell>
    );
  }

  const completed = demo.status === "completed";
  const StepComponent = STEP_COMPONENTS[activeStep] || DemoStepPlan;

  return (
    <PublicAssistanceShell
      title={completed ? "Test walkthrough complete" : "Test walkthrough"}
      subtitle={`Offer ${demo.offer_number} · isolated test session · nothing is charged or signed into effect`}
    >
      <DemoBanner offerNumber={demo.offer_number} />

      {completed ? (
        <DemoSuccess demo={demo} busy={busy} onRestart={restart} isAdmin={isAdmin} />
      ) : (
        <>
          <DemoStepper demo={demo} viewStep={activeStep} onSelect={setViewStep} />
          <div className="mb-2 flex items-center justify-between gap-2">
            {previousStep ? (
              <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setViewStep(previousStep)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            ) : <span />}
            <p className="text-[11px] text-slate-500">Step {stepIndex(activeStep) + 1} of {DEMO_STEPS.length}</p>
          </div>
          <StepComponent demo={demo} busy={busy} isAdmin={isAdmin} onSubmit={submit} onRefresh={refetch} />
        </>
      )}

      {isAdmin && (
        <div className="mt-4">
          <DemoAdminControls demo={demo} busy={busy} onRestart={restart} onRefresh={refetch} />
        </div>
      )}
    </PublicAssistanceShell>
  );
}