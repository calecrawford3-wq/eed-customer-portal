/**
 * Server-side email HTML sanitizer.
 * Strips dangerous content before storing the body so the viewer can safely
 * render rich HTML without re-fetching from Zoho every time.
 *
 * Removes: scripts, styles, iframes, objects, embeds, forms, inputs, buttons,
 * event-handler attributes (on*), javascript: URLs, and 1x1 tracking pixels.
 * Remote images are left intact at storage time — the frontend blocks them by
 * default and loads them only on user request.
 */

const DANGEROUS_TAGS_WITH_CONTENT = [
  'script', 'style', 'iframe', 'object', 'embed', 'applet', 'form',
];

const DANGEROUS_VOID_TAGS = /<\/?(script|iframe|object|embed|form|input|button|textarea|select|option|meta|link|base|applet)\b[^>]*>/gi;
const ON_ATTR = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL = /(href|src|action|formaction|data)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|\s*javascript:[^\s>]+)/gi;
const TRACKING_PIXEL = /<img\b[^>]*\b(?:width|height)\s*=\s*["']?1["']?[^>]*>/gi;

export function sanitizeStoredHtml(html) {
  if (!html) return "";
  let s = String(html);
  for (const tag of DANGEROUS_TAGS_WITH_CONTENT) {
    const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi');
    s = s.replace(re, ' ');
  }
  s = s.replace(DANGEROUS_VOID_TAGS, ' ');
  s = s.replace(ON_ATTR, '');
  s = s.replace(JS_URL, '');
  s = s.replace(TRACKING_PIXEL, ' ');
  return s.trim();
}