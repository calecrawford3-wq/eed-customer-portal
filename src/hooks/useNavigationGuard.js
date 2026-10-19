import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Navigation guard built on React Router's useBlocker (data router).
 *
 * useBlocker integrates with the routing system directly, so the URL and the
 * displayed page always agree: a blocked navigation is held before the URL
 * changes, and proceed()/reset() resume or cancel it cleanly. This replaces
 * the old history.pushState patching, which suppressed the URL change but
 * could not stop React Router from updating its internal location.
 *
 * Pages register a guard via useNavigationGuard(isDirty, onSave, hasEditorDraft):
 *   - isDirty:        () => boolean  — true when there are unsaved document edits
 *   - onSave:         () => Promise<boolean> — persists edits; resolves true on success
 *   - hasEditorDraft: () => boolean  — true when a mobile item editor has an unapplied draft
 *
 * Intentional navigations that follow a save (e.g. approving an estimate
 * navigates to the build) call the returned bypass() right before navigate()
 * so the guard does not re-prompt for changes the handler already persisted.
 *
 * Same-document query-string changes (same pathname + same id) are NOT blocked.
 *
 * Returns { blocker, bypass } where blocker is the React Router blocker object
 * (state, proceed, reset, location) and bypass() is a one-shot skip.
 */
export function useNavigationGuard(isDirty, onSave, hasEditorDraft) {
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const hasEditorDraftRef = useRef(hasEditorDraft);
  hasEditorDraftRef.current = hasEditorDraft;
  const bypassRef = useRef(false);

  const shouldBlock = useCallback(({ currentLocation, nextLocation }) => {
    if (bypassRef.current) {
      bypassRef.current = false;
      return false;
    }
    // Same pathname AND same id query param = same document; don't block
    // (e.g. tab toggles or post-save redirects within the same document).
    if (currentLocation.pathname === nextLocation.pathname) {
      const curId = new URLSearchParams(currentLocation.search).get("id");
      const nextId = new URLSearchParams(nextLocation.search).get("id");
      if (curId === nextId) return false;
    }
    const dirty = typeof isDirtyRef.current === "function" ? isDirtyRef.current() : !!isDirtyRef.current;
    return dirty;
  }, []);

  const blocker = useBlocker(shouldBlock);

  const bypass = useCallback(() => { bypassRef.current = true; }, []);

  // beforeunload for browser-level navigation (close tab, refresh).
  useEffect(() => {
    const handler = (e) => {
      const dirty = typeof isDirtyRef.current === "function" ? isDirtyRef.current() : !!isDirtyRef.current;
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return { blocker, bypass };
}