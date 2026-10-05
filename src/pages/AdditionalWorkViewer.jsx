import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { base44Public } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, Wrench, Check, AlertCircle } from "lucide-react";
import { formatMoney } from "@/lib/money";
import PhotoGallery from "@/components/findings/PhotoGallery";

const CONDITION_CLS = {
  good: "bg-emerald-100 text-emerald-700",
  worn: "bg-amber-100 text-amber-700",
  damaged: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
  needs_inspection: "bg-slate-100 text-slate-600",
  unknown: "bg-slate-100 text-slate-500",
};

export default function AdditionalWorkViewer() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(null);
  const [response, setResponse] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44Public.functions.invoke("getPublicAdditionalWork", { publicAccessToken: token });
        if (!res?.data) throw new Error("No data returned");
        setData(res.data);
      } catch (e) {
        setError(e?.message || "Failed to load approval");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const respond = async (action) => {
    setSubmitting(action);
    try {
      const res = await base44Public.functions.invoke("respondPublicAdditionalWork", {
        publicAccessToken: token,
        response: action,
        note,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      setResponse(action);
      setData((d) => ({ ...d, approval: { ...d.approval, customer_response: action, customer_note: note } }));
    } catch (e) {
      setError(e?.message || "Failed to submit response");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-[#e20404]" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full border-0 shadow-lg">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 mb-2">Unable to Load</h1>
            <p className="text-slate-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const aw = data?.approval;
  const findings = data?.findings || [];
  const canRespond = aw?.status === "pending" && aw?.customer_response === "pending";
  const alreadyResponded = aw?.customer_response && aw.customer_response !== "pending";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png"
            alt="Elite Engine Development"
            className="h-10 mb-3"
          />
          <h1 className="text-xl font-bold text-slate-900">{aw?.title || "Additional Work Approval"}</h1>
          {aw?.description && <p className="text-slate-600 text-sm mt-1">{aw.description}</p>}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge variant="outline" className="text-xs">{aw?.work_number}</Badge>
            <Badge className="bg-slate-100 text-slate-600 border-0 capitalize">{aw?.status}</Badge>
            {alreadyResponded && (
              <Badge className={response === "approved" || aw.customer_response === "approved" ? "bg-blue-100 text-blue-700 border-0" : "bg-red-100 text-red-700 border-0"}>
                {response === "approved" || aw.customer_response === "approved" ? "You approved" : "You declined"}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {findings.map((f) => (
          <Card key={f.id} className="border shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-[#e20404]" />
                  <span className="font-semibold text-slate-900">{f.component}</span>
                  <Badge className={CONDITION_CLS[f.condition] || "bg-slate-100 text-slate-600"}>
                    {(f.condition || "").replace(/_/g, " ")}
                  </Badge>
                </div>
                {f.recommended_action && f.recommended_action !== "none" && (
                  <Badge variant="outline" className="text-xs capitalize">Recommended: {f.recommended_action.replace(/_/g, " ")}</Badge>
                )}
              </div>
              {f.customer_description ? (
                <p className="text-sm text-slate-600">{f.customer_description}</p>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  {f.recommended_action && f.recommended_action !== "none"
                    ? `We recommend ${f.recommended_action.replace(/_/g, " ")} for this component.`
                    : "Inspected during teardown."}
                </p>
              )}
              {f.estimated_customer_charge > 0 && (
                <p className="text-xs text-slate-500 mt-2">Estimated: <span className="font-semibold text-slate-900">{formatMoney(f.estimated_customer_charge)}</span></p>
              )}
              {f.photos?.length > 0 && (
                <div className="mt-3">
                  <PhotoGallery photos={f.photos} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {/* Total summary */}
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Total additional work</span>
              <span className="text-2xl font-bold text-slate-900">{formatMoney(aw?.total)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Response actions */}
        {canRespond && (
          <Card className="border-2 border-[#e20404]/30 shadow-sm">
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold text-slate-900">Review and Respond</h2>
              <p className="text-sm text-slate-500">Review the findings and photos above, then approve or decline this additional work.</p>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" rows={2} />
              <div className="flex gap-2">
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => respond("approved")} disabled={!!submitting}>
                  {submitting === "approved" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Approve
                </Button>
                <Button variant="outline" onClick={() => respond("declined")} disabled={!!submitting}>
                  {submitting === "declined" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Decline
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!canRespond && alreadyResponded && (
          <div className="flex items-center gap-2 bg-blue-50 text-blue-700 rounded-lg p-4 text-sm">
            <Check className="w-4 h-4" />
            {response === "approved" || aw?.customer_response === "approved"
              ? "Thanks — you've approved this additional work. We'll process it and update your invoice."
              : "Thanks — you've declined this additional work. Let us know if you have questions."}
          </div>
        )}

        {!canRespond && !alreadyResponded && (
          <div className="flex items-center gap-2 bg-slate-100 text-slate-600 rounded-lg p-4 text-sm">
            <AlertCircle className="w-4 h-4" />
            This approval has been {aw?.status} and is no longer awaiting your response.
          </div>
        )}
      </div>
    </div>
  );
}