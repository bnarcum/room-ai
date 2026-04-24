import { preparePhotoForUpload } from "@/lib/prepareClientPhoto";
import { saveRoomAnalysisPayload } from "@/lib/resultStorage";

type AnalyzeResponse =
  | { ok: true; meta?: { provider?: string; model?: string }; data: unknown }
  | { ok: false; error: string };

/**
 * Shared by the home page and the guided wizard. Runs the same /api/analyze
 * + sessionStorage handoff as a single on-success contract for navigation.
 */
export async function runClientRoomAnalysis(input: {
  file: File;
  unit: "feet" | "meters";
  ceilingHeight: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let uploadFile: File;
  try {
    uploadFile = await preparePhotoForUpload(input.file);
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Could not prepare this photo for upload.",
    };
  }

  const form = new FormData();
  form.set("photo", uploadFile);
  const ceiling = input.ceilingHeight.trim();
  form.set("reference", ceiling ? "known-ceiling-height" : "none");
  form.set("unit", input.unit);
  if (ceiling) {
    form.set("knownCeilingHeight", ceiling);
  }

  let res: Response;
  try {
    res = await fetch("/api/analyze", { method: "POST", body: form });
  } catch {
    return { ok: false, error: "Network error while uploading. Please try again." };
  }

  if (res.status === 413) {
    return {
      ok: false,
      error:
        "Image was too large. Try a smaller export or a lower-resolution photo.",
    };
  }

  const json = (await res.json().catch(() => null)) as AnalyzeResponse | null;
  if (!res.ok || !json || !json.ok) {
    return {
      ok: false,
      error:
        (json && "error" in json && json.error) ||
        "The analysis failed. Please try a different photo.",
    };
  }

  if (!saveRoomAnalysisPayload(json)) {
    return {
      ok: false,
      error:
        "Could not save results in this browser (storage blocked or full). Allow site storage or try another browser, then try again.",
    };
  }

  return { ok: true };
}
