import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Paperclip, CheckCircle2, Copy, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import PublicAssistanceShell from "@/components/assistance/PublicAssistanceShell";
import ApplicationFormFields from "@/components/assistance/ApplicationFormFields";

export default function EngineAssistanceApply() {
  const { token } = useParams();
  const [answers, setAnswers] = useState({});
  const [consents, setConsents] = useState({ truthful: false, privacy: false, contact: true });
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["engine-assistance-template", token],
    queryFn: async () => {
      const res = await base44.functions.invoke("engineAssistanceApply", { action: "template", token });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    retry: false,
  });

  const fields = useMemo(() => (data?.template?.sections || []).flatMap((s) => s.fields || []), [data]);
  const statusUrl = result ? `${window.location.origin}/engine-assistance/status/${result.status_token}` : "";

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (documents.length >= 5) { toast.error("Up to 5 supporting files"); return; }
    setUploading(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      setDocuments((prev) => [...prev, { file_uri, filename: file.name, kind: "supporting" }]);
    } catch {
      toast.error("The file could not be uploaded");
    } finally {
      setUploading(false);
      if (event.target) event.target.value = "";
    }
  };

  const submit = async () => {
    const nextErrors = {};
    fields.forEach((field) => {
      if (field.required && !String(answers[field.key] ?? "").trim()) nextErrors[field.key] = "Required";
    });
    if (!consents.truthful || !consents.privacy) {
      toast.error("Please accept both acknowledgements");
      setErrors(nextErrors);
      return;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error("Please complete the required questions");
      return;
    }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("engineAssistanceApply", {
        action: "submit",
        token,
        answers,
        consents,
        documents,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setResult(res.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(error?.message || "The application could not be submitted");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <PublicAssistanceShell title="Engine Assistance application"><div className="flex items-center gap-2 text-sm text-slate-500 py-12"><Loader2 className="h-4 w-4 animate-spin" /> Loading the application…</div></PublicAssistanceShell>;
  }

  if (isError) {
    return (
      <PublicAssistanceShell title="Application link not valid">
        <Card><CardContent className="p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-none mt-0.5" />
          <div>
            <p className="font-medium text-slate-900">This link is no longer active.</p>
            <p className="text-sm text-slate-600 mt-1">Ask Elite Engine Development for a current application link, or call the shop and we will send one.</p>
          </div>
        </CardContent></Card>
      </PublicAssistanceShell>
    );
  }

  if (result) {
    return (
      <PublicAssistanceShell title="Application received" subtitle="Thank you — a person at Elite Engine Development will review it.">
        <Card><CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-none" />
            <div>
              <p className="font-semibold text-slate-900">Application {result.application_number}</p>
              <p className="text-sm text-slate-600 mt-1">Keep this private status link. It is the only way to check your application without signing in.</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs break-all text-slate-700">{statusUrl}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={async () => {
              try { await navigator.clipboard.writeText(statusUrl); toast.success("Status link copied"); }
              catch { toast.error("Copy failed"); }
            }}><Copy className="h-4 w-4" /> Copy status link</Button>
          </div>
          <Button asChild variant="outline"><Link to={`/engine-assistance/status/${result.status_token}`}>Open my status page</Link></Button>
        </CardContent></Card>
      </PublicAssistanceShell>
    );
  }

  return (
    <PublicAssistanceShell
      title={data?.fund?.name || "Affordable Engine Fund"}
      subtitle={data?.template?.intro_text || data?.fund?.intro || ""}
    >
      <div className="space-y-5">
        <Card><CardContent className="p-4 sm:p-6">
          <ApplicationFormFields sections={data?.template?.sections || []} answers={answers} setAnswers={setAnswers} errors={errors} disabled={submitting} />
        </CardContent></Card>

        <Card><CardContent className="p-4 sm:p-6 space-y-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Supporting documents (optional)</h3>
            <p className="text-sm text-slate-500">Photos of your engine, race results or a note from a track. Up to 5 files, stored privately.</p>
          </div>
          {documents.map((doc, index) => (
            <div key={index} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              <span className="flex items-center gap-1.5 min-w-0"><Paperclip className="h-4 w-4 flex-none text-slate-400" /><span className="truncate">{doc.filename}</span></span>
              <button onClick={() => setDocuments(documents.filter((_, i) => i !== index))} className="text-slate-400 hover:text-red-600" aria-label="Remove file"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <div>
            <Input type="file" disabled={uploading || documents.length >= 5} onChange={upload} className="max-w-sm" />
            {uploading && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</p>}
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4 sm:p-6 space-y-3">
          <h3 className="text-base font-bold text-slate-900">Acknowledgements</h3>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{data?.template?.consent_text}</p>
          <div className="space-y-2.5">
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <Checkbox checked={consents.truthful} onCheckedChange={(v) => setConsents({ ...consents, truthful: v === true })} className="mt-0.5" />
              <span>I confirm the information I provided is true and mine to share.</span>
            </label>
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <Checkbox checked={consents.privacy} onCheckedChange={(v) => setConsents({ ...consents, privacy: v === true })} className="mt-0.5" />
              <span>I understand applying does not guarantee assistance, and Elite may contact me about this application.</span>
            </label>
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <Checkbox checked={consents.contact} onCheckedChange={(v) => setConsents({ ...consents, contact: v === true })} className="mt-0.5" />
              <span>You may contact me by email or text about future fund opportunities.</span>
            </label>
          </div>
        </CardContent></Card>

        <Button size="lg" className="w-full sm:w-auto" disabled={submitting} onClick={submit}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {submitting ? "Submitting…" : "Submit application"}
        </Button>
      </div>
    </PublicAssistanceShell>
  );
}