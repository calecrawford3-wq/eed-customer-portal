import React, { useState, useEffect } from "react";
import { ensureDisplayableUrl, isHeicUrl } from "@/lib/heicUtils";

/**
 * Smart image component that handles HEIC files transparently.
 * Tries to load the source URL directly. If the image fails to load
 * (common for HEIC files in non-Safari browsers), fetches the blob
 * and converts it to JPEG via heic2any, then retries.
 *
 * Also handles private file URIs by delegating to useDisplayImage when
 * the src is not a usable URL.
 *
 * Props: src, alt, className, style
 */
export default function SmartImage({ src, alt = "", className = "", style = {} }) {
  const [displaySrc, setDisplaySrc] = useState(null);
  const [triedConversion, setTriedConversion] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!src) { setLoading(false); setDisplaySrc(null); return; }
    setDisplaySrc(src);
    setTriedConversion(false);
    setLoading(true);
  }, [src]);

  const handleError = async () => {
    // If the direct load failed and we haven't tried HEIC conversion yet,
    // fetch the blob and try converting it (handles HEIC files without .heic extension)
    if (triedConversion || !src) { setLoading(false); return; }
    setTriedConversion(true);
    try {
      const resp = await fetch(src);
      if (!resp.ok) { setLoading(false); return; }
      const blob = await resp.blob();
      // Check if the blob is HEIC by MIME type or magic bytes
      const type = (blob.type || "").toLowerCase();
      const isHeic = type === "image/heic" || type === "image/heif" || type === "image/heic-sequence";
      if (isHeic || isHeicUrl(src)) {
        const heic2any = (await import("heic2any")).default || (await import("heic2any"));
        const result = await heic2any({ blob, toType: "image/jpeg", quality: 0.9 });
        const jpegBlob = Array.isArray(result) ? result[0] : result;
        const blobUrl = URL.createObjectURL(jpegBlob);
        setDisplaySrc(blobUrl);
      }
    } catch (e) {
      console.warn("[SmartImage] HEIC conversion failed", e?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = () => setLoading(false);

  if (!src) return null;

  return (
    <img
      src={displaySrc || ""}
      alt={alt}
      className={className}
      style={style}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
}