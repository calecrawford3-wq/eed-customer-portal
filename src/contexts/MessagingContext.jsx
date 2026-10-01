import React, {
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { uploadAttachments } from "@/lib/messagingUtils";

const MessagingContext = createContext(null);

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext ||
        window.webkitAudioContext)();
    } catch (e) {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(frequency, duration, type, volume) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + duration
  );
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
}

function playSuccessSound() {
  playTone(880, 0.1, "sine", 0.1);
  setTimeout(() => playTone(1175, 0.12, "sine", 0.1), 90);
}

function playErrorSound() {
  playTone(196, 0.25, "sawtooth", 0.08);
}

export function MessagingProvider({ children }) {
  const queryClient = useQueryClient();
  const [pendingMessages, setPendingMessages] = useState([]);

  const send = useCallback(
    async (pendingMessage) => {
      const { tempId, _sendParams } = pendingMessage;
      const {
        attachmentsToUpload = [],
        ...variables
      } = _sendParams;

      try {
        const mediaUrls = await uploadAttachments(
          attachmentsToUpload
        );

        const result = await base44.functions.invoke(
          "sendVoipSms",
          {
            ...variables,
            media_urls: mediaUrls,
          }
        );

        await queryClient.invalidateQueries({
          queryKey: ["messages"],
        });

        setPendingMessages((prev) => {
          const removed = prev.find(
            (m) => m.tempId === tempId
          );
          if (removed?.previewUrls) {
            removed.previewUrls.forEach((url) =>
              URL.revokeObjectURL(url)
            );
          }
          return prev.filter((m) => m.tempId !== tempId);
        });

        if (result?.status === "sent") {
          playSuccessSound();
        } else {
          playErrorSound();
          toast.error(
            result?.status === "unknown"
              ? "Message sent but delivery unconfirmed — check the conversation."
              : "Message failed to send — check the conversation."
          );
        }
      } catch (error) {
        console.error("Send failed", error);

        // The backend may have succeeded even if the client-side invoke
        // threw (timeout, network blip). Refresh from the DB so the real
        // status shows instead of a stale "failed" pending message.
        await queryClient.invalidateQueries({ queryKey: ["messages"] });

        setPendingMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId
              ? { ...m, status: "failed" }
              : m
          )
        );

        playErrorSound();
      }
    },
    [queryClient]
  );

  const sendMessage = useCallback(
    (pendingMessage) => {
      setPendingMessages((prev) => [...prev, pendingMessage]);
      send(pendingMessage);
    },
    [send]
  );

  const retrySend = useCallback(
    (pendingMessage) => {
      setPendingMessages((prev) =>
        prev.map((m) =>
          m.tempId === pendingMessage.tempId
            ? { ...m, status: "sending" }
            : m
        )
      );
      send(pendingMessage);
    },
    [send]
  );

  return (
    <MessagingContext.Provider
      value={{ pendingMessages, sendMessage, retrySend }}
    >
      {children}
    </MessagingContext.Provider>
  );
}

export function useMessaging() {
  const ctx = useContext(MessagingContext);
  if (!ctx) {
    throw new Error(
      "useMessaging must be used within MessagingProvider"
    );
  }
  return ctx;
}