import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Upload, Paperclip, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// Documents live in private storage; opening one mints a short-lived signed URL
// through an admin-only backend function.
export default function ApplicationDocuments({ application, onChanged }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState("");
  const documents = application?.documents || [];

  const openDocument = async (fileUri) => {
    setOpening(fileUri);
    try {
      const res = await base44.functions.invoke("engineAssistanceDocument", { file_uri: fileUri });
      if (res.data?.signed_url) window.open(res.data.signed_url, "_blank", "noopener,noreferrer");
      else toast.error(res.data?.error || "The document could not be opened");
    } catch {
      toast.error("The document could not be opened");
    } finally {
      setOpening("");
    }
  };

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const res = await base44.functions.invoke("engineAssistanceAdmin", {
        action: "add_document",
        data: { application_id: application.id, file_uri, filename: file.name, kind: "staff_upload" },
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("Document attached");
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || "The document could not be attached");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (doc) => {
    const res = await base44.functions.invoke("engineAssistanceAdmin", {
      action: "remove_document",
      data: { application_id: application.id, file_uri: doc.file_uri, filename: doc.filename },
    });
    if (res.data?.error) toast.error(res.data.error);
    else { toast.success("Document removed"); onChanged?.(); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Paperclip className="h-4 w-4 text-[#e20404]" /> Documents</CardTitle>
        <p className="text-xs text-slate-500">Application documents are stored privately. Opening one creates a temporary secure link.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!documents.length && <p className="text-sm text-slate-500">No documents attached.</p>}
        {documents.map((doc) => (
          <div key={doc.file_uri} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 flex-none text-slate-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{doc.filename || "Document"}</p>
                <p className="text-[11px] text-slate-500">
                  {String(doc.kind || "supporting").replace(/_/g, " ")}
                  {doc.uploaded_at ? ` · ${format(new Date(doc.uploaded_at), "MMM d, yyyy")}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-none">
              <Button size="sm" variant="ghost" disabled={opening === doc.file_uri} onClick={() => openDocument(doc.file_uri)}>
                {opening === doc.file_uri ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open"}
              </Button>
              <button onClick={() => remove(doc)} className="p-2 text-slate-400 hover:text-red-600" aria-label="Remove document">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        <input ref={inputRef} type="file" className="hidden" onChange={upload} />
        <Button variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {uploading ? "Uploading…" : "Attach private document"}
        </Button>
      </CardContent>
    </Card>
  );
}