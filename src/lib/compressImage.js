import { isHeicFile, convertHeicBlob } from "./heicUtils";

/**
 * Compresses an image File so its byte size fits under `maxBytes`.
 * Uses canvas to re-encode as JPEG with progressively lower quality
 * and (if needed) progressively smaller dimensions.
 * Returns a new File (always JPEG) that is at or under the limit.
 * If the original file is already under the limit, it is returned unchanged.
 */
export async function compressImage(file, maxBytes = 1300 * 1024) {
  // HEIC files must always be converted — browsers can't render them.
  // Convert to JPEG first, then apply size compression if needed.
  if (isHeicFile(file)) {
    try {
      // Timeout safety: if heic2any hangs (large files, concurrent conversions),
      // give up after 25s and upload the original — SmartImage handles display conversion.
      const jpegBlob = await Promise.race([
        convertHeicBlob(file),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("HEIC conversion timeout")), 25000)
        ),
      ]);
      if (!jpegBlob) throw new Error("HEIC conversion returned empty result");
      const baseName = file.name.replace(/\.[^.]+$/, "");
      file = new File([jpegBlob], `${baseName}.jpg`, { type: "image/jpeg" });
    } catch (e) {
      console.warn("HEIC conversion failed, uploading original", e?.message);
      // Fall through — upload the original; SmartImage handles display-time conversion
    }
  }

  if (file.size <= maxBytes) return file;

  const image = await loadImage(file);

  // Cap initial dimensions to a reasonable max for MMS
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  const MAX_DIMENSION = 1920;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  let blob = await canvasToBlob(image, width, height, 0.9);

  // Step 1: lower JPEG quality
  let quality = 0.9;
  while (blob.size > maxBytes && quality > 0.3) {
    quality -= 0.1;
    blob = await canvasToBlob(image, width, height, quality);
  }

  // Step 2: shrink dimensions if quality alone wasn't enough
  while (blob.size > maxBytes && width > 256) {
    width = Math.round(width * 0.8);
    height = Math.round(height * 0.8);
    quality = 0.8;
    blob = await canvasToBlob(image, width, height, quality);
    while (blob.size > maxBytes && quality > 0.3) {
      quality -= 0.1;
      blob = await canvasToBlob(image, width, height, quality);
    }
  }

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for compression"));
    };
    img.src = url;
  });
}

function canvasToBlob(image, width, height, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}