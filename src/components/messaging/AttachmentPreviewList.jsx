import React from "react";
import { X, FileText } from "lucide-react";
import { isPdfAttachment } from "@/lib/messagingUtils";

export default function AttachmentPreviewList({ attachments, onRemove, disabled = false }) {
  if (!attachments.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment, index) => (
        <div
          key={attachment.id}
          className="relative w-20 h-20 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden"
        >
          {isPdfAttachment(attachment) ? (
            <div className="h-full flex flex-col items-center justify-center p-2 text-slate-700">
              <FileText className="w-7 h-7" />
              <span className="text-[10px] truncate w-full text-center">{attachment.file.name}</span>
            </div>
          ) : (
            <img src={attachment.previewUrl} alt="Selected image" className="w-full h-full object-cover" />
          )}
          <button
            type="button"
            onClick={() => onRemove(attachment.id)}
            disabled={disabled}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black disabled:opacity-50"
            title="Remove attachment"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}