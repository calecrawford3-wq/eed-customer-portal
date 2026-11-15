import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileUp, Loader2, Paperclip, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// Secure case attachments. Files are uploaded to private storage (stored
// privately); only this admin-only function issues short-lived signed links.
export default function CaseDocuments({ caseDoc, onChanged }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState("");
  const [kind, setKind] = useState("correspondence");
  const [note, setNote] = useState("");

  const invoke = async (action, data) => {
    const res = await base44.functions.invoke("engineAssistanceCollections", { action, data });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  };

  if (!caseDoc) return null;
  const documents = Array.isArray(caseDoc.documents) ? caseDoc.documents : [];

  const upload = async (file) => {
    if (!file) return;
    setBusy("upload");
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      await invoke("case_document_add", { case_id: caseDoc.id, file_uri, filename: file.name, kind });
      toast.success("Attachment stored privately");
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || "The file could not be uploaded");
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const open = async (doc) => {
    setBusy(doc.file_uri);
    try {
      const data = await invoke("case_document_url", { case_id: caseDoc.id, file_uri: doc.file_uri });
      if (data?.signed_url) window.open(data.signed_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error?.message || "The secure link could not be created");
    } finally {
      setBusy("");
    }
  };

  const review = async (doc) => {
    if (!note.trim()) { toast.error("Record what the review confirmed"); return; }
    setBusy(`review-${doc.file_uri}`);
    try {
      await invoke("case_document_review", { case_id: caseDoc.id, file_uri: doc.file_uri, note });
      toast.success("Document reviewed");
      setNote("");
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || "The review could not be saved");
    } finally {
      setBusy("");
    }
  };

  const remove = async (doc) => {
    setBusy(`remove-${doc.file_uri}`);
    try {
      await invoke("case_document_remove", { case_id: caseDoc.id, file_uri: doc.file_uri });
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || "The attachment could not be removed");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><Paperclip className="h-3.5 w-3.5" /> Case documents</p>
      {!documents.length ? <p className="text-[11px] text-slate-500">No attachments.</p> : (
        <div className="space-y-1.5">
          {documents.map((doc) => (
            <div key={doc.file_uri} className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <p className="min-w-0 truncate text-[11px] font-semibold text-slate-800">{doc.filename}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${doc.review_status === "reviewed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{doc.review_status || "pending"}</span>
              </div>
              <p className="text-[10px] text-slate-500">{doc.kind || "other"} · {doc.uploaded_at ? format(new Date(doc.uploaded_at), "MMM d, yyyy h:mm a") : ""} by {doc.uploaded_by}</p>
              {doc.review_note && <p className="text-[10px] text-slate-600">{doc.review_note}</p>}
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => open(doc)}>
                  {busy === doc.file_uri ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Open secure link
                </Button>
                {doc.review_status !== "reviewed" && (
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => review(doc)}>Mark reviewed</Button>
                )}
                <Button size="sm" variant="ghost" className="text-red-700" disabled={!!busy} onClick={() => remove(doc)}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" value={kind} onChange={(event) => setKind(event.target.value)} placeholder="Kind (correspondence, ID review memo…)" />
        <Input className="max-w-xs" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Review note" />
        <input ref={inputRef} type="file" className="hidden" onChange={(event) => upload(event.target.files?.[0])} />
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => inputRef.current?.click()}>
          {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />} Upload attachment
        </Button>
      </div>
      <p className="text-[10px] text-slate-400">Attachments are stored privately; links expire after ten minutes. Do not store a Social Security number or a full ID number in a file attached here.</p>
    </div>
  );
}