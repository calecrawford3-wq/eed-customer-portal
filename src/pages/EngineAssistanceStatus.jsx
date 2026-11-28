import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, Loader2, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import PublicAssistanceShell from "@/components/assistance/PublicAssistanceShell";
import StatusBadge from "@/components/assistance/StatusBadge";
import IncomeVerificationStep from "@/components/assistance/IncomeVerificationStep";

const COPY = {
  pending_payment: "Your application answers are saved. Complete income verification and pay the required $20 submission deposit to submit.",
  submitted: "Your application is in the review queue. We look at every application by hand — no decision has been made yet.",
  under_review: "A person at Elite is reviewing your application. We may reach out with a question.",
  info_requested: "We need a little more information before we can decide. Reply below and your application goes back into review.",
  approved: "Congratulations — assistance has been approved. Elite will send your offer with the build pricing and your remaining balance.",
  denied: "This application was not approved for this round. You are welcome to apply again in a future season.",
  funded: "Your assistance offer has been funded. Elite will be in touch about your build.",
  withdrawn: "This application was withdrawn.",
  expired: "This application expired before the offer was completed. Contact Elite if you would like it reopened.",
};

export default function EngineAssistanceStatus() {
  const { token } = useParams();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [incomeState, setIncomeState] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["engine-assistance-status", token],
    queryFn: async () => {
      const res = await base44.functions.invoke("engineAssistanceApply", { action: "status", statusToken: token });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data.application;
    },
    retry: false,
  });

  const reply = async () => {
    if (!message.trim() || (data?.income_request_pending && !incomeState?.can_submit)) return;
    setSending(true);
    try {
      const res = await base44.functions.invoke("engineAssistanceApply", { action: "respond_info", statusToken: token, message });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("Your reply was sent");
      setMessage("");
      refetch();
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.message || "Your reply could not be sent");
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return <PublicAssistanceShell title="Your application"><div className="flex items-center gap-2 text-sm text-slate-500 py-12"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></PublicAssistanceShell>;
  }

  if (isError || !data) {
    return (
      <PublicAssistanceShell title="Status link not valid">
        <Card><CardContent className="p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-none mt-0.5" />
          <p className="text-sm text-slate-700">This private status link is no longer active. Contact Elite Engine Development if you need an update.</p>
        </CardContent></Card>
      </PublicAssistanceShell>
    );
  }

  return (
    <PublicAssistanceShell
      title={`Application ${data.application_number}`}
      subtitle={data.first_name ? `Thanks for applying, ${data.first_name}.` : ""}
    >
      <div className="space-y-4">
        <Card><CardContent className="p-4 sm:p-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status} />
            {data.submitted_at && <span className="text-xs text-slate-500 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Submitted {format(new Date(data.submitted_at), "MMM d, yyyy")}</span>}
          </div>
          <p className="text-sm text-slate-700">{COPY[data.status] || "Your application is being processed."}</p>
          {data.decision_summary && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Decision</p>
              <p className="text-sm text-slate-800 whitespace-pre-wrap mt-1">{data.decision_summary}</p>
            </div>
          )}
        </CardContent></Card>

        {["pending_payment", "info_requested"].includes(data.status) && <IncomeVerificationStep
          statusToken={token}
          showSubmit={data.status === "pending_payment"}
          onSubmitted={() => refetch()}
          onStateChange={setIncomeState}
        />}

        {data.status === "info_requested" && (
          <Card><CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-purple-600 mt-0.5 flex-none" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Elite asked for more information</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{data.info_request_note}</p>
              </div>
            </div>
            <Textarea className="min-h-28" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your answer here" />
            {data.income_request_pending && !incomeState?.can_submit && <p className="text-xs text-amber-800">Complete the requested income documents above before sending your reply.</p>}
            <Button disabled={sending || !message.trim() || (data.income_request_pending && !incomeState?.can_submit)} onClick={reply}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send reply
            </Button>
          </CardContent></Card>
        )}

        {data.info_response && data.status !== "info_requested" && (
          <Card><CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your reply</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{data.info_response}</p>
          </CardContent></Card>
        )}
      </div>
    </PublicAssistanceShell>
  );
}