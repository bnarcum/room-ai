import { preparePhotoForUpload, preparePhotosForUpload } from "@/lib/prepareClientPhoto";
import {
  saveRoomAnalysisPayload,
  saveRoomExtraPhotoThumbnails,
  saveRoomPhotoThumbnail,
} from "@/lib/resultStorage";

type AnalyzeResponse =
  | { ok: true; meta?: { provider?: string; model?: string }; data: unknown }
  | { ok: false; error: string };

function appendAnalyzeFields(
  form: FormData,
  files: File[],
  unit: "feet" | "meters",
  ceilingHeight: string,
) {
  form.set("photo", files[0]);
  if (files[1]) form.set("photo2", files[1]);
  if (files[2]) form.set("photo3", files[2]);
  const ceiling = ceilingHeight.trim();
  form.set("reference", ceiling ? "known-ceiling-height" : "none");
  form.set("unit", unit);
  if (ceiling) {
    form.set("knownCeilingHeight", ceiling);
  }
}

/**
 * Shared by the home page and the guided wizard. Runs the same /api/analyze
 * + sessionStorage handoff as a single on-success contract for navigation.
 */
export async function runClientRoomAnalysis(input: {
  file: File;
  extraFiles?: File[];
  unit: "feet" | "meters";
  ceilingHeight: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const extras = (input.extraFiles ?? []).slice(0, 2);
  let uploadFiles: File[];
  try {
    uploadFiles = extras.length
      ? await preparePhotosForUpload([input.file, ...extras])
      : [await preparePhotoForUpload(input.file)];
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Could not prepare this photo for upload.",
    };
  }

  async function post(files: File[]): Promise<Response | null> {
    const form = new FormData();
    appendAnalyzeFields(form, files, input.unit, input.ceilingHeight);
    try {
      return await fetch("/api/analyze", { method: "POST", body: form });
    } catch {
      return null;
    }
  }

  let res = await post(uploadFiles);
  if (!res) {
    return { ok: false, error: "Network error while uploading. Please try again." };
  }

  if (res.status === 413 && uploadFiles.length > 2) {
    try {
      uploadFiles = await preparePhotosForUpload(uploadFiles.slice(0, 2));
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "Could not prepare this photo for upload.",
      };
    }
    res = await post(uploadFiles);
    if (!res) {
      return { ok: false, error: "Network error while uploading. Please try again." };
    }
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

  await saveRoomPhotoThumbnail(uploadFiles[0]);
  await saveRoomExtraPhotoThumbnails(uploadFiles.slice(1));

  if (!saveRoomAnalysisPayload(json)) {
    return {
      ok: false,
      error:
        "Could not save results in this browser (storage blocked or full). Allow site storage or try another browser, then try again.",
    };
  }

  return { ok: true };
}
