import { useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Sound: short two-tone chime generated via Web Audio API (no asset needed)
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const tones = [880, 1320];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.start(start);
      osc.stop(start + 0.2);
    });
    // Close context after sounds finish
    setTimeout(() => ctx.close(), 600);
  } catch (e) {
    // AudioContext not available — silently skip
  }
}

export default function useMessageNotifications() {
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const seenIdsRef = useRef(new Set());
  const initializedRef = useRef(false);

  // Fetch messages on the same cadence as the page
  const { data: messages = [] } = useQuery({
    queryKey: ["messages-notif"],
    queryFn: () => base44.entities.Message.list("-sent_at", 200),
    refetchInterval: 15000,
  });

  // Seed the seen set on first load so we don't notify for old messages
  useEffect(() => {
    if (messages.length > 0 && !initializedRef.current) {
      messages.forEach((m) => seenIdsRef.current.add(m.id));
      initializedRef.current = true;
    }
  }, [messages]);

  // Watch for new inbound messages and fire notifications
  useEffect(() => {
    if (!initializedRef.current || messages.length === 0) return;
    const newOnes = messages.filter(
      (m) => !seenIdsRef.current.has(m.id) && m.direction === "inbound"
    );
    if (newOnes.length === 0) {
      // Still add any new outbound IDs to seen so they don't trigger later
      messages.forEach((m) => seenIdsRef.current.add(m.id));
      return;
    }

    // Mark all current messages as seen
    messages.forEach((m) => seenIdsRef.current.add(m.id));

    // Only fire if permission granted AND the tab/PWA is in the background
    const isBackground =
      document.visibilityState === "hidden" || !document.hasFocus();

    if (permission === "granted" && isBackground) {
      // Group by phone number for a single notification per conversation
      const byPhone = {};
      newOnes.forEach((m) => {
        const key = m.phone_number || "";
        if (!byPhone[key]) byPhone[key] = [];
        byPhone[key].push(m);
      });

      Object.entries(byPhone).forEach(([phone, msgs]) => {
        const name = msgs[0]?.customer_name || phone;
        const body =
          msgs.length === 1
            ? msgs[0].body
            : `${msgs.length} new messages from ${name}`;
        try {
          const notif = new Notification(`New message from ${name}`, {
            body,
            tag: `msg-${phone}`,
            renotify: true,
            icon:
              "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png",
          });
          notif.onclick = () => {
            window.focus();
            const url = new URL("/Messaging", window.location.origin);
            url.searchParams.set("phone", phone);
            window.location.href = url.toString();
            notif.close();
          };
        } catch (e) {
          // Notification constructor may fail in some browsers — skip
        }
      });
      playChime();
    }

    // Always invalidate so the page query picks them up (if it hasn't already)
    queryClient.invalidateQueries({ queryKey: ["messages"] });
  }, [messages, permission, queryClient]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return "denied";
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  return { permission, requestPermission };
}