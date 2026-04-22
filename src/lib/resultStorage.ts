export const ROOM_ANALYSIS_STORAGE_KEY = "room-ai-analysis-v1";

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
