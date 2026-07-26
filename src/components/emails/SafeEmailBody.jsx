import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, FileText } from "lucide-react";
import { sanitizeEmailHtmlForDisplay, htmlHasImages } from "@/lib/sanitizeEmailHtml";

/**
 * Renders an email body safely. Prefers sanitized HTML; falls back to plain text.
 * Remote images are blocked until the user clicks "Load images" (privacy + tracking protection).
 */
export default function SafeEmailBody({ html, text }) {
  const [loadImages, setLoadImages] = useState(false);
  const safe = useMemo(
    () => sanitizeEmailHtmlForDisplay(html, { loadImages }),
    [html, loadImages]
  );

  if (!html) {
    return (
      <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">
        {text || "(no body)"}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {htmlHasImages(html) && !loadImages && (
        <button
          onClick={() => setLoadImages(true)}
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-[#e20404] border border-red-200 bg-red-50 rounded px-2 py-1 hover:bg-red-100"
        >
          <ImageIcon className="w-3.5 h-3.5" /> Load remote images
        </button>
      )}
      {htmlHasImages(html) && loadImages && (
        <button
          onClick={() => setLoadImages(false)}
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 bg-slate-50 rounded px-2 py-1 hover:bg-slate-100"
        >
          <FileText className="w-3.5 h-3.5" /> Block images
        </button>
      )}
      <style>{`.email-body p, .email-body div { margin-top: 0 !important; margin-bottom: 0 !important; }`}</style>
      <div
        className="email-body text-sm text-slate-800 break-words max-w-none [&_img]:max-w-full [&_a]:text-[#e20404] [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    </div>
  );
}