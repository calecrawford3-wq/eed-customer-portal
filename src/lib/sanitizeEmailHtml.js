/**
 * Frontend email HTML sanitizer for safe display.
 * Uses the DOM for accurate parsing, then:
 *  - removes scripts, iframes, forms, and other dangerous elements
 *  - strips on* event handler attributes and javascript: URLs
 *  - blocks remote images by default (moves src -> data-src); loads them when
 *    loadImages=true (prevents tracking pixels from reporting opens/IPs)
 *  - forces links to open in a new tab with rel=noopener noreferrer
 */
const REMOVE_TAGS = [
  "script", "style", "iframe", "object", "embed", "form", "input", "button",
  "textarea", "select", "meta", "link", "base", "applet",
];

export function sanitizeEmailHtmlForDisplay(html, { loadImages = false } = {}) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  for (const tag of REMOVE_TAGS) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }
  doc.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const val = String(attr.value || "").toLowerCase().trim();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      if ((name === "href" || name === "src" || name === "action") && val.startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    });
    if (el.tagName === "IMG") {
      const src = el.getAttribute("src") || "";
      const isRemote = src && !src.startsWith("data:") && !src.startsWith("cid:");
      if (!loadImages && isRemote) {
        el.setAttribute("data-src", src);
        el.removeAttribute("src");
        el.setAttribute("alt", el.getAttribute("alt") || "image");
      } else if (loadImages) {
        const d = el.getAttribute("data-src");
        if (d) {
          el.setAttribute("src", d);
          el.removeAttribute("data-src");
        }
      }
    }
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  });
  return doc.body ? doc.body.innerHTML : "";
}

/** Quick check for whether the raw HTML contains any <img> (for showing the load toggle). */
export function htmlHasImages(html) {
  return /<img\b/i.test(String(html || ""));
}