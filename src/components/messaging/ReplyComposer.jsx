import React, { useRef } from "react";
import { Paperclip, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  MAX_ATTACHMENTS,
  buildAttachmentsFromFiles,
  revokeAttachmentPreviews,
} from "@/lib/messagingUtils";
import AttachmentPreviewList from "./AttachmentPreviewList";

export default function ReplyComposer({
  draft,
  setDraft,
  attachments,
  setAttachments,
  attachmentError,
  setAttachmentError,
  onSend,
  onKeyDown,
}) {
  const replyFileInputRef = useRef(null);

  const handleReplyFiles = async (event) => {
    try {
      const additions = await buildAttachmentsFromFiles(event.target.files, attachments.length);
      setAttachments((current) => [...current, ...additions]);
      setAttachmentError("");
    } catch (error) {
      setAttachmentError(error?.message || "Unable to attach image.");
    } finally {
      event.target.value = "";
    }
  };

  const removeReplyAttachment = (attachmentId) => {
    setAttachments((current) => {
      const removed = current.find((a) => a.id === attachmentId);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((a) => a.id !== attachmentId);
    });
    setAttachmentError("");
  };

  return (
    <div className="bg-white border-t border-slate-200 p-3 space-y-2 flex-shrink-0">
      <AttachmentPreviewList attachments={attachments} onRemove={removeReplyAttachment} />

      {attachmentError && <p className="text-xs text-red-600">{attachmentError}</p>}

      <div className="flex items-center gap-2">
        <input
          ref={replyFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif"
          multiple
          className="hidden"
          onChange={handleReplyFiles}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => replyFileInputRef.current?.click()}
          disabled={attachments.length >= MAX_ATTACHMENTS}
          title="Attach images"
        >
          <Paperclip className="w-4 h-4" />
        </Button>

        <Input
          placeholder={attachments.length > 0 ? "Add a caption, optional..." : "Type a message..."}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          className="flex-1"
        />

        <Button
          onClick={onSend}
          disabled={!draft.trim() && attachments.length === 0}
          className="bg-[#e20404] hover:bg-red-700"
          size="icon"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex justify-between text-xs text-slate-400">
        <span>{`${attachments.length}/${MAX_ATTACHMENTS} images`}</span>
        <span>
          {draft.length} characters
          {(draft.length > 160 || attachments.length > 0) && " · Sends as MMS"}
        </span>
      </div>
    </div>
  );
}