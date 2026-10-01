import React from "react";
import { AlertCircle, Loader2, RefreshCw, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime, getMediaUrls } from "@/lib/messagingUtils";

export default function MessageBubble({
  message,
  onRetryPending,
  onResend,
  resendIsPending,
}) {
  const mediaUrls = getMediaUrls(message);
  const hasBody = Boolean(String(message.body || "").trim());

  return (
    <div className="flex items-end gap-1.5">
      {message._pending && message.status === "failed" && (
        <button
          type="button"
          onClick={() => onRetryPending(message)}
          className="flex-shrink-0 w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors"
          title="Tap to retry"
        >
          <AlertCircle className="w-4 h-4" />
        </button>
      )}

      {!message._pending && message.direction === "outbound" && (message.status === "failed" || message.status === "unknown") && (
        <button
          type="button"
          onClick={() => onResend(message)}
          disabled={resendIsPending}
          className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center hover:bg-amber-200 transition-colors disabled:opacity-50"
          title="Resend message"
        >
          {resendIsPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      <div
        className={cn(
          "relative max-w-[75%] rounded-2xl px-4 py-2 text-sm overflow-hidden",
          message.direction === "outbound"
            ? "bg-[#e20404] text-white rounded-br-sm"
            : "bg-white border border-slate-200 text-slate-900 rounded-bl-sm",
          message._pending && message.status === "sending" && "opacity-70"
        )}
      >
        {message._pending && message.status === "sending" && (
          <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl overflow-hidden bg-white/20">
            <div
              className="h-full w-1/3 bg-white/80"
              style={{ animation: "pendingShimmer 1.2s ease-in-out infinite" }}
            />
          </div>
        )}

        {hasBody && <p className="whitespace-pre-wrap break-words">{message.body}</p>}

        {mediaUrls.length > 0 && (
          <div className={cn("space-y-2", hasBody && "mt-2")}>
            {mediaUrls.map((mediaUrl, index) => (
              <a
                key={`${message.id}-media-${index}`}
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <img
                  src={mediaUrl}
                  alt={`MMS attachment ${index + 1}`}
                  className="block max-w-full max-h-96 rounded-lg object-contain bg-slate-100"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                    const fallback = event.currentTarget.nextElementSibling;
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
                <div className="hidden min-h-24 items-center justify-center gap-2 rounded-lg bg-slate-100 text-slate-500 px-4 py-3">
                  <ImageIcon className="w-5 h-5" />
                  <span>Open attachment</span>
                </div>
              </a>
            ))}
          </div>
        )}

        {!hasBody && mediaUrls.length === 0 && message.channel === "mms" && (
          <p className="italic opacity-70">Attachment unavailable</p>
        )}

        <div
          className={cn(
            "text-[10px] mt-1",
            message.direction === "outbound" ? "text-white/70" : "text-slate-400"
          )}
        >
          {message._pending && message.status === "sending"
            ? "Sending…"
            : formatTime(message.sent_at)}
          {message._pending && message.status === "failed" && " · Not Delivered"}
          {!message._pending && message.direction === "outbound" && message.status === "failed" && " · Not delivered"}
          {!message._pending && message.direction === "outbound" && message.status === "unknown" && " · Unconfirmed"}
        </div>
      </div>
    </div>
  );
}