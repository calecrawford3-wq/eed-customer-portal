import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { isHeicUrl, ensureDisplayableUrl } from "@/lib/heicUtils";

/**
 * Resolves a file URI (private storage URI or http URL) to a displayable URL.
 * - Private URIs are converted to signed URLs via CreateFileSignedUrl.
 * - HEIC signed URLs are converted to JPEG blob URLs via heic2any.
 * Returns { url, loading }.
 */
export function useDisplayImage(fileUri) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fileUri) { setLoading(false); setUrl(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let displayUrl = fileUri;
        // If it's not already a usable URL, create a signed URL
        if (!/^https?:/.test(fileUri) && !fileUri.startsWith("blob:") && !fileUri.startsWith("data:")) {
          const res = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri });
          displayUrl = res?.signed_url || fileUri;
        }
        // Convert HEIC if needed
        if (isHeicUrl(displayUrl)) {
          displayUrl = await ensureDisplayableUrl(displayUrl);
        }
        if (!cancelled) setUrl(displayUrl);
      } catch (e) {
        console.error("useDisplayImage failed", e);
        if (!cancelled) setUrl(fileUri);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fileUri]);

  return { url, loading };
}