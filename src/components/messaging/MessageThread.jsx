import React, { useEffect, useRef } from "react";
import { formatDayLabel, normalizePhone } from "@/lib/messagingUtils";
import MessageBubble from "./MessageBubble";

export default function MessageThread({
  selectedPhone,
  selectedConversation,
  pendingMessages,
  onRetryPending,
  onResend,
  resendIsPending,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedConversation?.messages.length, selectedPhone]);

  const pendingForConv = pendingMessages.filter(
    (m) => normalizePhone(m.phone_number) === selectedPhone
  );

  const allMessages = [...(selectedConversation?.messages || []), ...pendingForConv].sort(
    (a, b) => new Date(a.sent_at || 0) - new Date(b.sent_at || 0)
  );

  let lastDay = "";

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
      {allMessages.map((message) => {
        const dayLabel = formatDayLabel(message.sent_at);
        const showDay = dayLabel !== lastDay;
        lastDay = dayLabel;
        return (
          <div key={message.id || message.tempId}>
            {showDay && (
              <div className="text-center my-3">
                <span className="text-xs text-slate-400 bg-slate-50 px-2">{dayLabel}</span>
              </div>
            )}
            <div
              className={
                message.direction === "outbound"
                  ? "flex items-end gap-1.5 justify-end"
                  : "flex items-end gap-1.5 justify-start"
              }
            >
              <MessageBubble
                message={message}
                onRetryPending={onRetryPending}
                onResend={onResend}
                resendIsPending={resendIsPending}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}