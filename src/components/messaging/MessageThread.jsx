import React, { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
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
  const queryClient = useQueryClient();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedConversation?.messages.length, selectedPhone]);

  // Poll VoIP.ms for delivery confirmation on recent outbound messages
  useEffect(() => {
    if (!selectedPhone || !selectedConversation) return;

    const checkDelivery = async () => {
      const undelivered = (selectedConversation?.messages || [])
        .filter(
          (m) =>
            m.direction === "outbound" &&
            m.message_id &&
            m.status !== "delivered" &&
            !m.delivered_at
        )
        .map((m) => ({ id: m.id, voip_id: m.message_id }));

      if (undelivered.length === 0) return;

      try {
        const result = await base44.functions.invoke("checkSmsDelivery", {
          messages: undelivered,
        });
        if (result?.updated?.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["messages"] });
        }
      } catch (e) {
        // Silent — will retry on next poll
      }
    };

    checkDelivery();
    const interval = setInterval(checkDelivery, 30000);
    return () => clearInterval(interval);
  }, [selectedPhone, selectedConversation?.messages?.length]);

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