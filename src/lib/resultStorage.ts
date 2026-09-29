export const ROOM_ANALYSIS_STORAGE_KEY = "room-ai-analysis-v1";
export const ROOM_PHOTO_STORAGE_KEY = "room-ai-photo-v1";
export const ROOM_EXTRA_PHOTOS_STORAGE_KEY = "room-ai-photos-extra-v1";

/** Skip extras if the JSON payload would crowd sessionStorage (~5 MiB typical). */
const EXTRA_PREVIEWS_MAX_CHARS = 1_800_000;

export function saveRoomAnalysisPayload(payload: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    sessionStorage.setItem(ROOM_ANALYSIS_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadRoomAnalysisPayload(): unknown | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ROOM_ANALYSIS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function loadRoomPhotoPreview(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ROOM_PHOTO_STORAGE_KEY);
    return raw && raw.startsWith("data:image/") ? raw : null;
  } catch {
    return null;
  }
}

export function saveRoomPhotoPreview(dataUrl: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    sessionStorage.setItem(ROOM_PHOTO_STORAGE_KEY, dataUrl);
    return true;
  } catch {
    return false;
  }
}

export function loadRoomExtraPhotoPreviews(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(ROOM_EXTRA_PHOTOS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string =>
        typeof item === "string" && item.startsWith("data:image/"),
    );
  } catch {
    return [];
  }
}

export function saveRoomExtraPhotoPreviews(dataUrls: string[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (dataUrls.length === 0) {
      sessionStorage.removeItem(ROOM_EXTRA_PHOTOS_STORAGE_KEY);
      return true;
    }
    const raw = JSON.stringify(dataUrls);
    if (raw.length > EXTRA_PREVIEWS_MAX_CHARS) {
      if (dataUrls.length > 1) {
        const smaller = JSON.stringify(dataUrls.slice(0, 1));
        if (smaller.length <= EXTRA_PREVIEWS_MAX_CHARS) {
          sessionStorage.setItem(ROOM_EXTRA_PHOTOS_STORAGE_KEY, smaller);
          return true;
        }
      }
      sessionStorage.removeItem(ROOM_EXTRA_PHOTOS_STORAGE_KEY);
      return false;
    }
    sessionStorage.setItem(ROOM_EXTRA_PHOTOS_STORAGE_KEY, raw);
    return true;
  } catch {
    try {
      sessionStorage.removeItem(ROOM_EXTRA_PHOTOS_STORAGE_KEY);
    } catch {
      /* quota / private mode */
    }
    return false;
  }
}

async function fileToJpegDataUrl(
  file: File,
  maxDim: number,
  quality: number,
): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(file);
    try {
      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", quality);
    } finally {
      bmp.close();
    }
  } catch {
    return null;
  }
}

export async function saveRoomPhotoThumbnail(file: File): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const dataUrl = await fileToJpegDataUrl(file, 1440, 0.72);
  if (!dataUrl) return false;
  return saveRoomPhotoPreview(dataUrl);
}

export async function saveRoomExtraPhotoThumbnails(files: File[]): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const urls: string[] = [];
  for (const file of files.slice(0, 2)) {
    const dataUrl = await fileToJpegDataUrl(file, 720, 0.58);
    if (dataUrl) urls.push(dataUrl);
  }
  return saveRoomExtraPhotoPreviews(urls);
}
