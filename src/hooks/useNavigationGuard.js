import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Navigation guard for unsaved documents.
 *
 * With BrowserRouter (not the data router), useBlocker is unavailable, so we
 * intercept navigation by patching history.pushState/replaceState (which
 * react-router uses for <Link> and navigate()) and listening for popstate
 * (browser back/forward). When a guard is active and dirty, the navigation is
 * held and a dialog offers Stay / Discard / Save & Leave.
 *
 * beforeunload covers browser-level navigation (close tab, refresh) where
 * supported. On iPhone Home Screen PWA, beforeunload does not fire, so the
 * in-app interception is the primary protection.
 *
 * Only one guard is active at a time (the mounted detail page). The dialog
 * component (NavigationGuardDialog) subscribes to the blocked-navigation
 * state via useSyncExternalStore.
 */

// ---- Module-level singleton state ----
let guard = null;        // { isDirty: () => boolean, onSave: () => Promise<boolean> }
let blocked = null;       // { type, retry, stay } | null
let lastUrl = "";         // last known URL (for popstate restore)
const listeners = new Set();

function emit() { listeners.forEach((l) => l()); }
function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function getSnapshot() { return blocked; }

export function setGuard(g) { guard = g; }

function updateLastUrl() {
  lastUrl = window.location.pathname + window.location.search + window.location.hash;
}

// ---- Patch history once (module-level) ----
let patched = false;
function patchHistoryOnce() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const originalPush = history.pushState.bind(history);
  const originalReplace = history.replaceState.bind(history);
  updateLastUrl();

  function handleIntercept(original, type, args) {
    if (guard && guard.isDirty()) {
      blocked = {
        type,
        retry: () => { blocked = null; emit(); original(...args); updateLastUrl(); },
      };
      emit();
      return; // suppress the navigation
    }
    const ret = original(...args);
    updateLastUrl();
    return ret;
  }

  history.pushState = function (...args) { return handleIntercept(originalPush, "push", args); };
  history.replaceState = function (...args) { return handleIntercept(originalReplace, "replace", args); };

  // popstate: back/forward already changed the URL. Restore it by pushing the
  // last known URL back (using the original, unpatched pushState to avoid
  // re-triggering the intercept). The dialog then offers Stay (do nothing) or
  // Discard (history.back() to actually leave).
  window.addEventListener("popstate", () => {
    if (guard && guard.isDirty()) {
      const restoreUrl = lastUrl;
      // Push the original URL back so the page content stays.
      originalPush(history.state, "", restoreUrl);
      blocked = {
        type: "pop",
        retry: () => { blocked = null; emit(); history.back(); },
      };
      emit();
      return;
    }
    updateLastUrl();
  });
}
patchHistoryOnce();

// ---- Hook for pages ----
export function useNavigationGuard(isDirty, onSave) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // Register/unregister the guard (only one active at a time).
  useEffect(() => {
    setGuard({
      isDirty: () => isDirtyRef.current,
      onSave: () => onSaveRef.current?.(),
    });
    return () => { if (guard?.isDirty === (() => isDirtyRef.current)) setGuard(null); else setGuard(null); };
  }, []);

  // beforeunload for browser-level navigation.
  useEffect(() => {
    const handler = (e) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
}

// ---- Hook for the dialog component ----
export function useBlockedNavigation() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ---- Dialog actions ----
export function clearBlocked() { blocked = null; emit(); }
export function proceedBlocked() { if (blocked) blocked.retry(); }
export async function saveAndProceed() {
  if (!guard) { clearBlocked(); return false; }
  const ok = await guard.onSave();
  if (ok && blocked) { blocked.retry(); return true; }
  // Save failed (or no save handler): stay on the document, keep edits.
  clearBlocked();
  return false;
}