/**
 * Browser-side shrink so multipart POST stays under Vercel’s ~4.5 MiB limit (413 otherwise).
 */

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
 * Ensures the file fits under Vercel's multipart limit by re-encoding large images as JPEG.
 * Original files under {@link CLIENT_UPLOAD_SAFE_BYTES} are returned unchanged.
 */
export async function preparePhotoForUpload(file: File): Promise<File> {
  if (file.size <= CLIENT_UPLOAD_SAFE_BYTES) {
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
      if (blob.size <= CLIENT_UPLOAD_SAFE_BYTES) {
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
