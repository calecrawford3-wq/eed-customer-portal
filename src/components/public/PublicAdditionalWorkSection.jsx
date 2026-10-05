import React, { useState, useEffect } from "react";
import { FileText, Camera, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { ensureDisplayableUrl, isHeicUrl } from "@/lib/heicUtils";

const CONDITION_LABEL = {
  good: "Good", worn: "Worn", damaged: "Damaged",
  failed: "Failed", needs_inspection: "Needs Inspection", unknown: "Unknown",
};
const ACTION_LABEL = {
  none: "—", inspect: "Inspect", repair: "Repair", replace: "Replace",
};

export default function PublicAdditionalWorkSection({ additionalWork = [] }) {
  const [lightbox, setLightbox] = useState(null); // { urls, index }
  const [displayUrls, setDisplayUrls] = useState({}); // original -> converted for HEIC

  // Collect all photo URLs from all additional work findings
  const allPhotoUrls = (additionalWork || []).flatMap(aw =>
    (aw.findings || []).flatMap(f => (f.photos || []).map(p => p.signed_url).filter(Boolean))
  );

  // Convert HEIC signed URLs for browser display
  useEffect(() => {
    let cancelled = false;
    for (const url of allPhotoUrls) {
      if (!url || !isHeicUrl(url) || displayUrls[url]) continue;
      ensureDisplayableUrl(url).then((converted) => {
        if (!cancelled && converted && converted !== url) {
          setDisplayUrls((prev) => ({ ...prev, [url]: converted }));
        }
      });
    }
    return () => { cancelled = true; };
  }, [allPhotoUrls.join("|"), displayUrls]);

  const getDisplayUrl = (url) => displayUrls[url] || url;

  if (!additionalWork || additionalWork.length === 0) return null;

  const openLightbox = (photos, idx) => setLightbox({ urls: photos.map(p => getDisplayUrl(p.signed_url)), index: idx });
  const closeLightbox = () => setLightbox(null);
  const nextPhoto = () => setLightbox(l => l ? { ...l, index: (l.index + 1) % l.urls.length } : l);
  const prevPhoto = () => setLightbox(l => l ? { ...l, index: (l.index - 1 + l.urls.length) % l.urls.length } : l);

  return (
    <>
      {additionalWork.map((aw) => {
        const findingsWithPhotos = (aw.findings || []).filter(f => (f.photos || []).length > 0);
        if (findingsWithPhotos.length === 0) return null;
        return (
          <div key={aw.id} className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-[#e20404]" />
              <h3 className="font-semibold text-slate-900">Inspection Findings — {aw.title || aw.work_number}</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Photos from the teardown inspection behind the approved additional work on this invoice.
            </p>

            <div className="space-y-5">
              {findingsWithPhotos.map((f) => (
                <div key={f.id} className="border border-slate-100 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div>
                      <p className="font-medium text-slate-900">{f.component}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Condition: <span className="capitalize">{CONDITION_LABEL[f.condition] || f.condition}</span>
                        {f.recommended_action && f.recommended_action !== "none" && (
                          <> · Recommended: {ACTION_LABEL[f.recommended_action] || f.recommended_action}</>
                        )}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Camera className="w-3.5 h-3.5" /> {f.photos.length} photo{f.photos.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {f.customer_description && (
                    <p className="text-sm text-slate-600 mb-3">{f.customer_description}</p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {f.photos.map((photo, idx) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => openLightbox(f.photos, idx)}
                        className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-[#e20404] transition"
                      >
                        <img
                          src={getDisplayUrl(photo.signed_url)}
                          alt={photo.caption || f.component}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {photo.caption && (
                          <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 truncate text-left">
                            {photo.caption}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {aw.total > 0 && (
              <p className="text-xs text-slate-400 mt-3">Approved additional work total: {formatMoney(aw.total)}</p>
            )}
          </div>
        );
      })}

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={closeLightbox}
        >
          <button className="absolute top-4 right-4 text-white/80 hover:text-white p-2" onClick={closeLightbox}>
            <X className="w-6 h-6" />
          </button>
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 text-3xl"
            onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
          >‹</button>
          <img
            src={lightbox.urls[lightbox.index]}
            alt="Inspection photo"
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 text-3xl"
            onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
          >›</button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
            {lightbox.index + 1} / {lightbox.urls.length}
          </span>
        </div>
      )}
    </>
  );
}