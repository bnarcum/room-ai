/**
 * Browser-side shrink so multipart POST stays under Vercel’s ~4.5 MiB limit (413 otherwise).
 */

import { MAX_ANALYZE_PHOTOS } from "@/lib/analyzePhotos";
import { MAX_IMAGE_FILE_BYTES_VERCEL } from "@/lib/uploadLimits";

export const CLIENT_UPLOAD_SAFE_BYTES = MAX_IMAGE_FILE_BYTES_VERCEL;

function stripExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function bitmapToJpegBlob(
  bmp: ImageBitmap,
  maxDim: number,
  quality: number,
): Promise<Blob> {
  const w = bmp.width;
  const h = bmp.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not available in this browser.");
  }
  ctx.drawImage(bmp, 0, 0, cw, ch);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Could not encode image."));
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Ensures the file fits under a byte budget by re-encoding large images as JPEG.
 * Original files under {@link maxBytes} are returned unchanged.
 */
export async function preparePhotoForUpload(
  file: File,
  maxBytes: number = CLIENT_UPLOAD_SAFE_BYTES,
): Promise<File> {
  const budget = Math.max(32 * 1024, maxBytes);
  if (file.size <= budget) {
    return file;
  }

  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error(
      "Could not read this image in the browser. Export as JPEG or PNG and try again.",
    );
  }

  try {
    let maxDim = 4096;
    let quality = 0.88;

    for (let attempt = 0; attempt < 18; attempt++) {
      const blob = await bitmapToJpegBlob(bmp, maxDim, quality);
      if (blob.size <= budget) {
        const outName = `${stripExtension(file.name) || "room"}.jpg`;
        return new File([blob], outName, { type: "image/jpeg" });
      }
      maxDim = Math.max(640, Math.floor(maxDim * 0.82));
      quality = Math.max(0.52, quality - 0.04);
    }

    throw new Error(
      "This photo is still too large after compressing. Try a smaller image or lower resolution.",
    );
  } finally {
    bmp.close();
  }
}

export function perPhotoUploadBudget(photoCount: number): number {
  const count = Math.max(1, Math.min(MAX_ANALYZE_PHOTOS, Math.floor(photoCount)));
  return Math.floor(CLIENT_UPLOAD_SAFE_BYTES / count);
}

/** Compress every selected file so the multipart POST stays under Vercel’s body cap. */
export async function preparePhotosForUpload(files: File[]): Promise<File[]> {
  const capped = files.slice(0, MAX_ANALYZE_PHOTOS);
  if (capped.length === 0) return [];

  async function prepareSet(set: File[]): Promise<File[]> {
    const budget = perPhotoUploadBudget(set.length);
    const out: File[] = [];
    for (const file of set) {
      out.push(await preparePhotoForUpload(file, budget));
    }
    return out;
  }

  let prepared = await prepareSet(capped);
  while (
    prepared.length > 2 &&
    prepared.reduce((n, f) => n + f.size, 0) > CLIENT_UPLOAD_SAFE_BYTES
  ) {
    prepared = await prepareSet(prepared.slice(0, 2));
  }
  return prepared;
}
