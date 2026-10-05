import React, { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { ensureDisplayableUrl, isHeicUrl } from "@/lib/heicUtils";
import SmartImage from "@/components/findings/SmartImage";

/**
 * Reusable photo gallery with a thumbnail strip and a fullscreen lightbox
 * (tap to enlarge, prev/next navigation). Used in the customer portal and
 * the public additional-work approval viewer.
 *
 * Props:
 *  photos: [{ signed_url, caption }]
 *  maxThumbs: number of thumbnails to show inline (default 6)
 */
export default function PhotoGallery({ photos = [], maxThumbs = 6 }) {
  const [active, setActive] = useState(null); // index or null
  const [displayUrls, setDisplayUrls] = useState({}); // original -> converted

  const close = () => setActive(null);
  const prev = () => setActive((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
  const next = () => setActive((i) => (i === null ? i : (i + 1) % photos.length));

  // Convert HEIC signed URLs to JPEG blob URLs for browser display
  useEffect(() => {
    let cancelled = false;
    for (const p of photos) {
      const url = p?.signed_url;
      if (!url || !isHeicUrl(url) || displayUrls[url]) continue;
      ensureDisplayableUrl(url).then((converted) => {
        if (!cancelled && converted && converted !== url) {
          setDisplayUrls((prev) => ({ ...prev, [url]: converted }));
        }
      });
    }
    return () => { cancelled = true; };
  }, [photos, displayUrls]);

  const getDisplayUrl = (url) => displayUrls[url] || url;

  useEffect(() => {
    if (active === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, photos.length]);

  if (!photos.length) return null;

  const shown = photos.slice(0, maxThumbs);
  const overflow = photos.length - shown.length;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 hover:border-[#e20404] transition-colors group"
          >
            <SmartImage src={getDisplayUrl(p.signed_url)} alt={p.caption || ""} className="w-full h-full object-cover" />
            {i === 0 && photos[0]?.is_cover && (
              <span className="absolute bottom-0 left-0 right-0 bg-amber-400/80 text-amber-900 text-[8px] font-bold text-center">COVER</span>
            )}
          </button>
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => setActive(maxThumbs)}
            className="w-16 h-16 rounded-lg border border-slate-200 flex items-center justify-center text-xs font-medium text-slate-500 hover:border-[#e20404]"
          >
            +{overflow}
          </button>
        )}
      </div>

      {active !== null && photos[active] && (
        <div
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4"
          onClick={close}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
            onClick={(e) => { e.stopPropagation(); close(); }}
          >
            <X className="w-7 h-7" />
          </button>
          {photos.length > 1 && (
            <>
              <button
                className="absolute left-2 sm:left-4 text-white/80 hover:text-white p-2"
                onClick={(e) => { e.stopPropagation(); prev(); }}
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              <button
                className="absolute right-2 sm:right-4 text-white/80 hover:text-white p-2"
                onClick={(e) => { e.stopPropagation(); next(); }}
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            </>
          )}
          <div className="max-w-3xl max-h-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <SmartImage
              src={getDisplayUrl(photos[active].signed_url)}
              alt={photos[active].caption || ""}
              className="max-w-full max-h-[75vh] object-contain rounded-lg"
            />
            {photos[active].caption && (
              <p className="text-white/90 text-sm mt-3 text-center max-w-xl">{photos[active].caption}</p>
            )}
            <span className="text-white/50 text-xs mt-2">{active + 1} / {photos.length}</span>
          </div>
        </div>
      )}
    </>
  );
}