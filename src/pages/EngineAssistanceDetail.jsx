import React, { useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, History, Wallet } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import StatusBadge from "@/components/assistance/StatusBadge";
import ApplicationSummary from "@/components/assistance/ApplicationSummary";
import FinancialReviewPanel from "@/components/assistance/FinancialReviewPanel";
import ApplicationDecisionPanel from "@/components/assistance/ApplicationDecisionPanel";
import ApplicationDocuments from "@/components/assistance/ApplicationDocuments";
import OfferPanel from "@/components/assistance/OfferPanel";
import BuildJobPanel from "@/components/assistance/BuildJobPanel";
import FinancingPanel from "@/components/assistance/FinancingPanel";
import InternalLoanPanel from "@/components/assistance/InternalLoanPanel";
import AgreementPanel from "@/components/assistance/AgreementPanel";
import CollectionsPanel from "@/components/assistance/CollectionsPanel";
import IdentityVerificationPanel from "@/components/assistance/IdentityVerificationPanel";
import LedgerTable from "@/components/assistance/LedgerTable";
import DemoSessionPanel from "@/components/assistance/demo/DemoSessionPanel";
import ApplicationProgress from "@/components/assistance/admin/ApplicationProgress";
import NextActionPanel from "@/components/assistance/admin/NextActionPanel";
import { applicationStage } from "@/components/assistance/admin/applicationStage";

export default function EngineAssistanceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const qc = useQueryClient();
  const [busy, setBusy] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["engine-assistance-application", id],
    queryFn: async () => {
      const found = await base44.entities.EngineAssistanceApplication.filter({ id });
      const application = (Array.isArray(found) ? found : found?.items || [])[0];
      if (!application) return { application: null };
      const [offers, attempts, ledger, build, job, platforms, loans] = await Promise.all([
        base44.entities.EngineAssistanceOffer.filter({ application_id: id }),
        base44.entities.EngineAssistanceFinancingAttempt.filter({ application_id: id }),
        base44.entities.EngineAssistanceLedgerEntry.filter({ application_id: id }),
        application.build_id ? base44.entities.EngineBuild.filter({ id: application.build_id }) : Promise.resolve([]),
        application.job_id ? base44.entities.Job.filter({ id: application.job_id }) : Promise.resolve([]),
        base44.entities.EnginePlatform.list("name", 200),
        base44.entities.EngineAssistanceInternalLoan.filter({ application_id: id }),
      ]);
      const toList = (result) => (Array.isArray(result) ? result : result?.items || []);
      const offerList = toList(offers);
      const sorted = offerList.slice().sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));
      const selectedOffer = sorted[0] || null;
      const loanList = toList(loans).slice().sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));
      const selectedLoan = loanList.find((item) => !selectedOffer || item.offer_id === selectedOffer.id) || loanList[0] || null;
      const [agreements, cases, settingsList, verifications, identitySettingsList, emailDeliveries] = await Promise.all([
        selectedOffer ? base44.entities.EngineAssistanceAgreement.filter({ offer_id: selectedOffer.id }) : Promise.resolve([]),
        selectedLoan ? base44.entities.EngineAssistanceCollectionsCase.filter({ loan_id: selectedLoan.id }) : Promise.resolve([]),
        base44.entities.EngineAssistanceSettings.filter({ key: "global" }),
        selectedLoan ? base44.entities.EngineAssistanceIdentityVerification.filter({ loan_id: selectedLoan.id }) : Promise.resolve([]),
        base44.entities.EngineAssistanceIdentitySettings.filter({ key: "global" }),
        base44.entities.EngineAssistanceEmailDelivery.filter({ application_id: id }),
      ]);
      const agreementList = toList(agreements).slice().sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));
      return {
        application,
        offer: selectedOffer,
        attempts: toList(attempts),
        ledger: toList(ledger),
        build: toList(build)[0] || null,
        job: toList(job)[0] || null,
        platforms: toList(platforms),
        loan: selectedLoan,
        agreement: agreementList[0] || null,
        caseDoc: toList(cases)[0] || null,
        verification: toList(verifications)[0] || null,
        identitySettings: toList(identitySettingsList)[0] || null,
        settings: toList(settingsList)[0] || null,
        deliveries: toList(emailDeliveries),
      };
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["engine-assistance-application", id] });
    qc.invalidateQueries({ queryKey: ["engine-assistance-applications"] });
    qc.invalidateQueries({ queryKey: ["engine-assistance-offers"] });
    qc.invalidateQueries({ queryKey: ["engine-assistance-ledger"] });
  };

  const describeEmail = (email) => {
    if (!email) return "";
    if (email.duplicate) return "This email was already delivered — no duplicate was sent";
    if (email.status === "sent") return "Email delivered to the customer";
    return `Email not delivered: ${email.error || "the mail provider did not confirm it"}. The secure link is still valid — copy it, or retry below.`;
  };

  const run = async (action, payload = {}) => {
    setBusy(action);
    try {
      const res = await base44.functions.invoke("engineAssistanceAdmin", { action, data: payload });
      if (res.data?.error) throw new Error(res.data.error);
      if (action === "delete_application") { if (!res.data?.deleted) throw new Error("Deletion was not confirmed"); toast.success("Application permanently deleted"); refresh(); navigate("/EngineAssistance"); return; }
      const email = res.data?.email;

      // A send is only reported as successful when the provider accepted it.
      if (action === "send_offer" || action === "resend_offer_email" || action === "retry_email") {
        if (email && (email.status === "sent" || email.duplicate)) toast.success(describeEmail(email));
        else toast.error(`Saved, but the customer email was not delivered: ${email?.error || "the mail provider did not confirm delivery"}. The secure link below is still valid.`);
        refresh();
        return;
      }
      if (action === "record_manual_payment" || action === "decide") {
        toast.success(action === "decide" ? "Decision recorded" : "Payment recorded");
        if (email && email.status !== "sent" && !email.duplicate) toast.error(describeEmail(email));
        refresh();
        return;
      }

      toast.success(
        action === "decide" ? "Decision recorded"
          : action === "request_info" ? "Information requested"
            : action === "create_build" ? "Engine build created"
              : action === "create_offer" ? "Offer draft created"
                : action === "send_offer" ? "Offer sent"
                  : action === "revoke_offer" ? "Offer link revoked"
                    : action === "record_manual_payment" ? "Payment recorded"
                      : action === "create_job" ? "Shop job opened"
                        : action === "financing_review" ? "Financing review saved"
                        : action === "approve_internal_loan" ? "In-house terms approved"
                          : action === "decline_internal_loan" ? "In-house request declined"
                            : action === "record_loan_payment" ? "Installment recorded"
                              : action === "check_financing" ? "Lender status refreshed"
                                : "Saved"
      );
      refresh();
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.message || "The action could not be completed");
    } finally {
      setBusy("");
    }
  };

  const audit = useMemo(() => {
    if (!data?.application) return [];
    const appTrail = (data.application.audit_trail || []).map((entry) => ({ ...entry }));
    const offerTrail = (data.offer?.audit_trail || []).map((entry) => ({ ...entry, action: `offer: ${entry.action}` }));
    return [...appTrail, ...offerTrail].sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, 60);
  }, [data]);

  if (isLoading) {
    return <div className="p-8 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading application…</div>;
  }
  if (isError || !data?.application) {
    return (
      <div className="p-8">
        <p className="font-semibold text-slate-900">Application not found</p>
        <Link to="/EngineAssistance" className="text-sm text-[#e20404] underline">Back to Engine Assistance</Link>
      </div>
    );
  }

  const { application, offer, attempts, ledger, build, job, platforms, loan, agreement, caseDoc, settings, verification, identitySettings, deliveries } = data;
  const stage = applicationStage({ application, offer, loan, verification, caseDoc });
  const name = `${application.first_name || ""} ${application.last_name || ""}`.trim() || "Applicant";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/EngineAssistance" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-3.5 w-3.5" /> Engine Assistance
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1 break-words">{name}</h1>
          <p className="text-sm text-slate-500">
            {application.application_number} · {application.email}
            {application.phone ? ` · ${application.phone}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={application.status} />
          {offer && <StatusBadge status={offer.status} />}
          <Button variant="outline" className="text-red-700 border-red-200" disabled={!!busy} onClick={() => setDeleteOpen(true)}>Delete application</Button>
        </div>
      </div>

      {deleteOpen && <Card><CardContent className="p-4 space-y-3"><h3 className="font-bold text-red-700">Permanently delete application</h3><p className="text-sm">This removes the local application, financial review, statement metadata and invitation delivery records. Linked offers, payments, customer records or shop work block deletion. Stripe records and uploaded files remain in provider storage.</p><label className="block text-sm">Type {application.application_number} to confirm<input className="block w-full border rounded p-2 mt-1" value={deleteConfirmation} onChange={e=>setDeleteConfirmation(e.target.value)} /></label><div className="flex gap-2"><Button variant="destructive" disabled={!!busy || deleteConfirmation !== application.application_number} onClick={()=>run("delete_application",{application_id:id,confirmation:deleteConfirmation})}>Permanently delete</Button><Button variant="outline" onClick={()=>{setDeleteOpen(false);setDeleteConfirmation("")}}>Cancel</Button></div></CardContent></Card>}
      <ApplicationProgress stages={stage.stages} action={stage.action} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">
          <ApplicationSummary application={application} />
          <FinancialReviewPanel application={application} onChanged={refresh} />
          <OfferPanel application={application} offer={offer} onAction={run} busy={!!busy} loan={loan} deliveries={deliveries} />
          <DemoSessionPanel offer={offer} application={application} />
          <InternalLoanPanel offer={offer} loan={loan} onAction={run} busy={!!busy} identity={verification} settings={settings} />
          <IdentityVerificationPanel
            loan={loan}
            verification={verification}
            identitySettings={identitySettings}
            onChanged={refresh}
          />
          <AgreementPanel
            offer={offer}
            loan={loan}
            agreement={agreement}
            templateStatus={settings?.agreement_template_status || "draft"}
            onChanged={refresh}
          />
          <CollectionsPanel
            loan={loan}
            caseDoc={caseDoc}
            application={application}
            agreement={agreement}
            onChanged={refresh}
          />
          <BuildJobPanel application={application} build={build} job={job} platforms={platforms} offer={offer} onAction={run} busy={!!busy} />
          <FinancingPanel attempts={attempts} onReview={(payload) => run("financing_review", payload)} onRefresh={(attemptId) => run("refresh_financing_attempt", { attempt_id: attemptId })} busy={!!busy} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4 text-[#e20404]" /> Fund ledger</CardTitle>
              <p className="text-xs text-slate-500">Awards and payments recorded for this application.</p>
            </CardHeader>
            <CardContent>
              <LedgerTable entries={ledger} emptyText="No awards or payments recorded yet." />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 order-1 lg:order-2">
          <NextActionPanel loan={loan} verification={verification} settings={settings} onAction={run} busy={!!busy} />
          <ApplicationDecisionPanel application={application} onAction={run} busy={!!busy} />
          <ApplicationDocuments application={application} onChanged={refresh} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-[#e20404]" /> Audit trail</CardTitle>
            </CardHeader>
            <CardContent>
              {!audit.length ? <p className="text-sm text-slate-500">No activity yet.</p> : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {audit.map((entry, index) => (
                    <div key={index} className="text-xs border-l-2 border-slate-200 pl-2.5">
                      <p className="font-medium text-slate-700">{String(entry.action || "").replace(/_/g, " ")}</p>
                      {entry.note && <p className="text-slate-500 break-words">{entry.note}</p>}
                      <p className="text-[10px] text-slate-400 mt-0.5">{entry.at ? format(new Date(entry.at), "MMM d, yyyy h:mm a") : ""}{entry.by ? ` · ${entry.by}` : ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}