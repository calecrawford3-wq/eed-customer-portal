import { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// VAPID public key (generated for this app — paired with the private key stored as a secret)
const VAPID_PUBLIC_KEY = "BMBpTXGhlZnXx0XZMNaRbOlnRshfzAqIwO0eD5s8ffD9BWE7legurx0YUDkrdQfmX03PDFdx2FmpACu0IArhVdc";
const SW_PATH = "/sw.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function usePushNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [subscribed, setSubscribed] = useState(false);

  // Register the service worker
  const registerSW = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    try {
      const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
      await navigator.serviceWorker.ready;
      return reg;
    } catch (err) {
      console.error("SW registration failed:", err);
      return null;
    }
  }, []);

  // Subscribe to push and send subscription to backend
  const subscribe = useCallback(async (reg) => {
    try {
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      setSubscribed(true);

      await base44.functions.invoke("subscribeToPush", {
        endpoint: sub.endpoint,
        p256dh: arrayBufferToBase64(sub.getKey("p256dh")),
        auth: arrayBufferToBase64(sub.getKey("auth")),
        user_agent: navigator.userAgent,
      });
    } catch (err) {
      console.error("Push subscription failed:", err);
      setSubscribed(false);
    }
  }, []);

  // On mount: register SW and subscribe if permission already granted
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    (async () => {
      if (Notification.permission === "granted") {
        const reg = await registerSW();
        if (reg) await subscribe(reg);
      } else {
        // Still register the SW so it's ready when the user enables notifications
        await registerSW();
      }
    })();
  }, [registerSW, subscribe]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Push notifications are not supported in this browser.");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      const reg = await registerSW();
      if (reg) await subscribe(reg);
    }
  }, [registerSW, subscribe]);

  return { permission, subscribed, requestPermission };
}