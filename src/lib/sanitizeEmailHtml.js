/**
 * Frontend email HTML sanitizer for safe display + spacing normalization.
 *
 * Safety: removes scripts/iframes/forms, strips on* handlers and javascript: URLs,
 * blocks remote images by default (src -> data-src) and re-enables on request.
 *
 * Spacing: email clients (Outlook/Zoho) often emit big inline margins, MSO-only
 * styles, and stacked empty <div>/<br> blocks that render as huge vertical gaps.
 * We strip those, collapse repeated breaks, and trim leading/trailing whitespace
 * so the body looks like it does in Zoho Mail.
 */
const REMOVE_TAGS = [
  "script", "style", "iframe", "object", "embed", "form", "input", "button",
  "textarea", "select", "meta", "link", "base", "applet",
];

// Inline style properties that create large vertical gaps in rendered email
const STRIP_STYLE_PROPS = new Set([
  "margin", "margin-top", "margin-bottom", "margin-left", "margin-right",
  "padding", "padding-top", "padding-bottom",
  "line-height", "height", "min-height", "max-height",
]);

export function sanitizeEmailHtmlForDisplay(html, { loadImages = false } = {}) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  for (const tag of REMOVE_TAGS) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }
  doc.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("class");

    // Clean inline styles: drop gap-causing props and all MSO-only declarations
    const style = el.getAttribute("style");
    if (style) {
      const kept = style.split(";").map((s) => s.trim()).filter((decl) => {
        if (!decl) return false;
        const prop = (decl.split(":")[0] || "").trim().toLowerCase();
        if (prop.startsWith("mso-")) return false;
        if (STRIP_STYLE_PROPS.has(prop)) return false;
        return true;
      });
      if (kept.length) el.setAttribute("style", kept.join("; "));
      else el.removeAttribute("style");
    }

    // Sanitize attributes (event handlers + javascript: URLs)
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const val = String(attr.value || "").toLowerCase().trim();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      if ((name === "href" || name === "src" || name === "action") && val.startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    });

    // Block / load remote images
    if (el.tagName === "IMG") {
      const src = el.getAttribute("src") || "";
      const isRemote = src && !src.startsWith("data:") && !src.startsWith("cid:");
      if (!loadImages && isRemote) {
        el.setAttribute("data-src", src);
        el.removeAttribute("src");
        el.setAttribute("alt", el.getAttribute("alt") || "image");
      } else if (loadImages) {
        const d = el.getAttribute("data-src");
        if (d) { el.setAttribute("src", d); el.removeAttribute("data-src"); }
      }
    }

    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  });

  let out = doc.body ? doc.body.innerHTML : "";

  // Collapse empty block containers (only <br>/&nbsp;/whitespace) to a single break
  out = out.replace(/<(div|p|span)[^>]*>\s*(<br\s*\/?>)?\s*(&nbsp;|\s)*\s*(<br\s*\/?>)?\s*<\/\1>/gi, "<br>");
  // Collapse 3+ consecutive <br> (with optional whitespace between) to two
  out = out.replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>");
  // Trim leading/trailing breaks, nbsp, and whitespace
  out = out.replace(/^(\s|<br\s*\/?>|&nbsp;)+/i, "").replace(/(\s|<br\s*\/?>|&nbsp;)+$/i, "");
  return out;
}

/** Quick check for whether the raw HTML contains any <img> (for showing the load toggle). */
export function htmlHasImages(html) {
  return /<img\b/i.test(String(html || ""));
}