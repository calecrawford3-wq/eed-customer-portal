import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ExternalLink, Loader2, PlayCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { DEMO_STEPS } from "@/lib/demoSteps";

const TEST_OFFER = "EAO-2026-1002";

// Admin entry point for the isolated walkthrough. Starting it requires an
// authenticated admin; the created link can only ever advance the test session.
export default function DemoSessionPanel({ offer, application }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const enabled = offer?.offer_number === TEST_OFFER;
  const { data: sessions = [] } = useQuery({
    queryKey: ["assistance-demo-sessions", offer?.id],
    queryFn: async () => {
      const found = await base44.entities.EngineAssistanceDemoSession.filter({ offer_id: offer.id }, { sort: "-created_date", limit: 10 });
      return Array.isArray(found) ? found : found?.items || [];
    },
    enabled: !!offer?.id && enabled,
  });

  if (!enabled) return null;

  const start = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("engineAssistanceDemo", { action: "create", offer_id: offer.id });
      if (res.data?.error) throw new Error(res.data.error);
      await qc.invalidateQueries({ queryKey: ["assistance-demo-sessions", offer.id] });
      const link = `${window.location.origin}/engine-assistance/demo/${res.data.token}`;
      window.open(link, "_blank", "noopener");
      toast.success("Test walkthrough started — link opened in a new tab");
    } catch (err) {
      toast.error(err?.message || "The test walkthrough could not be started");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-amber-300 bg-amber-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><PlayCircle className="h-4 w-4 text-amber-700" /> Isolated test walkthrough</CardTitle>
        <p className="flex items-start gap-1.5 text-[11px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
          TEST MODE — NO REAL PAYMENT OR ID VERIFICATION. Runs only for {TEST_OFFER}; never writes to the offer, loan, agreement, identity, payment, ledger, job or collections records.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button size="sm" className="w-full" disabled={busy} onClick={start}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Start new test walkthrough
        </Button>

        {sessions.length === 0 ? (
          <p className="text-[11px] text-slate-600">No test sessions yet{application?.application_number ? ` for ${application.application_number}` : ""}.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div key={session.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-slate-800">{session.status} · {session.completed_steps?.length || 0}/{DEMO_STEPS.length} steps</p>
                  <Link to={`/engine-assistance/demo/${session.token}`} target="_blank" className="inline-flex items-center gap-1 text-[11px] font-medium text-[#e20404] underline">
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Started {session.started_at ? format(new Date(session.started_at), "MMM d, h:mm a") : "—"}
                  {session.created_by ? ` · ${session.created_by}` : ""}{session.restarts ? ` · restarts ${session.restarts}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}