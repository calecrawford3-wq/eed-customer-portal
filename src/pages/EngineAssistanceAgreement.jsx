import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import PublicAssistanceShell from "@/components/assistance/PublicAssistanceShell";
import AgreementDocument from "@/components/assistance/agreement/AgreementDocument";
import AgreementSignatureForm from "@/components/assistance/agreement/AgreementSignatureForm";

// Customer-facing printable copy of the retail installment agreement. The long
// random agreement token is the only credential; the page shows the exact
// snapshot and wording that were issued, plus the signature record.
export default function EngineAssistanceAgreement() {
  const { token } = useParams();
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["engine-assistance-agreement", token],
    queryFn: async () => {
      const res = await base44.functions.invoke("engineAssistanceAgreement", { token, action: "get" });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    retry: false,
  });

  const accept = async (payload) => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("engineAssistanceAgreement", {
        token, action: "accept", signature_name: payload.name,
        esign_consent: payload.esign_consent === true,
        accept_terms: payload.accept_terms === true,
        autopay_authorized: payload.autopay_authorized === true,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("Agreement signed. You can print or save your signed copy.");
      await refetch();
    } catch (error) {
      toast.error(error?.message || "This agreement could not be signed");
    } finally {
      setBusy(false);
    }
  };

  const agreement = data?.agreement;

  if (isLoading) {
    return (
      <PublicAssistanceShell title="Retail Installment Agreement">
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading your agreement…</div>
      </PublicAssistanceShell>
    );
  }

  if (isError || !agreement) {
    return (
      <PublicAssistanceShell title="Agreement unavailable">
        <Card><CardContent className="flex items-start gap-3 p-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
          <div>
            <p className="font-medium text-slate-900">This agreement link is no longer active.</p>
            <p className="mt-1 text-sm text-slate-600">Contact Elite Engine Development and we will send you a current copy.</p>
          </div>
        </CardContent></Card>
      </PublicAssistanceShell>
    );
  }

  return (
    <PublicAssistanceShell
      title="Retail Installment Agreement"
      subtitle={`${agreement.agreement_number} · ${data?.offer?.fund_name || "Affordable Engine Fund"}`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <p className="text-xs text-slate-600">
            {agreement.status === "accepted"
              ? `Signed by ${agreement.signer_name}. This copy is your record.`
              : "Review every section, then sign below."}
          </p>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print / save PDF</Button>
        </div>

        <AgreementDocument agreement={agreement} />

        {agreement.status === "accepted" ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 print:hidden">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
            <p>Signed {agreement.accepted_at ? new Date(agreement.accepted_at).toLocaleString() : ""}. You can print or save this page at any time. Elite can also send a paper copy on request.</p>
          </div>
        ) : (
          <Card className="print:hidden"><CardContent className="space-y-3 p-4 sm:p-6">
            <div>
              <p className="text-sm font-semibold text-slate-900">Sign this agreement</p>
              <p className="text-xs text-slate-600">Signing is voluntary. Nothing is owed under the in-house plan until the down payment is paid.</p>
            </div>
            <AgreementSignatureForm
              busy={busy}
              autopayEnabled={data?.autopay_enabled === true}
              disabledReason={data?.can_accept ? "" : data?.can_accept_reason || "Elite must approve your final terms before you can sign."}
              onSubmit={accept}
            />
          </CardContent></Card>
        )}

        <p className="text-[11px] text-slate-500 print:hidden">
          Hardship, payment questions or a billing dispute: {agreement.snapshot?.contacts?.servicing_phone || "call Elite"} · {agreement.snapshot?.contacts?.dispute_email || agreement.snapshot?.contacts?.servicing_email || "email Elite"}.
        </p>
      </div>
    </PublicAssistanceShell>
  );
}