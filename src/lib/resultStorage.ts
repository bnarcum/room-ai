export const ROOM_ANALYSIS_STORAGE_KEY = "room-ai-analysis-v1";
export const ROOM_PHOTO_STORAGE_KEY = "room-ai-photo-v1";

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

export async function saveRoomPhotoThumbnail(file: File): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const bmp = await createImageBitmap(file);
    try {
      const maxDim = 360;
      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      return saveRoomPhotoPreview(dataUrl);
    } finally {
      bmp.close();
    }
  } catch {
    return false;
  }
}
