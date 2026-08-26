import React, {
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

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

async function uploadAttachments(attachments) {
  const uploadedUrls = [];
  for (const attachment of attachments) {
    const result = await base44.integrations.Core.UploadFile({
      file: attachment.file,
    });
    if (!result?.file_url) {
      throw new Error(
        `Upload failed for ${attachment.file.name}.`
      );
    }
    uploadedUrls.push(result.file_url);
  }
  return uploadedUrls;
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

        await base44.functions.invoke("sendVoipSms", {
          ...variables,
          media_urls: mediaUrls,
        });

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

        playSuccessSound();
      } catch (error) {
        console.error("Send failed", error);

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