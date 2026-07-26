import React, { useState } from "react";
import { Paperclip, Download, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

function fmtSize(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function EmailAttachments({ attachments, accountId, folderId, messageId }) {
  const [downloading, setDownloading] = useState(null);
  if (!attachments || !attachments.length) return null;

  const handleDownload = async (a) => {
    const key = a.attachment_id || a.filename;
    if (!a.attachment_id) {
      toast.error("This attachment has no download reference (re-sync this email).");
      return;
    }
    setDownloading(key);
    try {
      const res = await base44.functions.invoke("getEmailAttachment", {
        account_id: a.account_id || accountId,
        folder_id: a.folder_id || folderId,
        message_id: a.message_id || messageId,
        attachment_id: a.attachment_id,
      });
      const d = res?.data;
      if (d?.error) throw new Error(d.error);
      if (!d?.data) throw new Error("No file data returned");
      const byteChars = atob(d.data);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: d.content_type || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = a.filename || "attachment";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Download failed: " + (e?.message || "error"));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a, i) => {
        const key = a.attachment_id || a.filename || i;
        const isDl = downloading === key;
        return (
          <div key={key} className="flex items-center gap-2 border rounded px-2 py-1 bg-slate-50 text-xs">
            <Paperclip className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-medium text-slate-700 truncate max-w-[180px]">{a.filename}</span>
            {a.size ? <span className="text-slate-400">{fmtSize(a.size)}</span> : null}
            <button
              onClick={() => handleDownload(a)}
              disabled={isDl}
              className="text-[#e20404] hover:text-[#c00303] disabled:opacity-50"
              title="Download"
            >
              {isDl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}