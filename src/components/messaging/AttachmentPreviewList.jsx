import React from "react";
import { X } from "lucide-react";

export default function AttachmentPreviewList({ attachments, onRemove, disabled }) {
  if (!attachments.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment, index) => (
        <div
          key={attachment.id}
          className="relative w-20 h-20 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden"
        >
          <img
            src={attachment.previewUrl}
            alt={`Selected attachment ${index + 1}`}
            className="w-full h-full object-cover"
          />
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