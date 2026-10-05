/**
 * HEIC/HEIF detection and conversion utilities.
 * Browsers (except Safari) cannot render HEIC images, so we convert them
 * to JPEG using heic2any — both at upload time (compressImage) and at
 * display time (PhotoGallery, FindingPhotoManager).
 */

let heic2anyModule = null;

async function getHeic2any() {
  if (heic2anyModule) return heic2anyModule;
  const mod = await import("heic2any");
  heic2anyModule = mod.default || mod;
  return heic2anyModule;
}

/** True if a File/Blob is HEIC/HEIF (by MIME type or filename extension). */
export function isHeicFile(file) {
  if (!file) return false;
  const type = (file.type || "").toLowerCase();
  if (type === "image/heic" || type === "image/heif" || type === "image/heic-sequence") return true;
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif") || name.endsWith(".heics");
}

/** True if a URL/filename looks like HEIC. */
export function isHeicUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase().split("?")[0];
  return lower.endsWith(".heic") || lower.endsWith(".heif") || lower.endsWith(".heics");
}

/** Convert a HEIC Blob to a JPEG Blob. Returns the original blob if not HEIC. */
export async function convertHeicBlob(blob) {
  if (!isHeicFile(blob) && !isHeicUrl(blob.name || "")) return blob;
  const heic2any = await getHeic2any();
  const result = await heic2any({ blob, toType: "image/jpeg", quality: 0.9 });
  const out = Array.isArray(result) ? result[0] : result;
  return out;
}

/**
 * Given an image URL, return a displayable URL. If the URL points to a HEIC
 * file, fetches the blob, converts it to JPEG, and returns a blob: URL.
 * Otherwise returns the original URL unchanged.
 */
const heicCache = new Map();

export async function ensureDisplayableUrl(url) {
  if (!url || !isHeicUrl(url)) return url;
  if (heicCache.has(url)) return heicCache.get(url);
  const resp = await fetch(url);
  if (!resp.ok) return url;
  const blob = await resp.blob();
  const jpegBlob = await convertHeicBlob(blob);
  const blobUrl = URL.createObjectURL(jpegBlob);
  heicCache.set(url, blobUrl);
  return blobUrl;
}