import { preparePhotoForUpload } from "@/lib/prepareClientPhoto";
import type { QuickEstimate } from "@/lib/quickEstimate";

type QuickEstimateResponse =
  | { ok: true; meta?: { provider?: string; model?: string }; data: QuickEstimate }
  | { ok: false; error: string };

export async function runClientQuickEstimate(input: {
  file: File;
}): Promise<
  | { ok: true; meta?: { provider?: string; model?: string }; data: QuickEstimate }
  | { ok: false; error: string }
> {
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

  let res: Response;
  try {
    res = await fetch("/api/quick-estimate", { method: "POST", body: form });
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

  const json = (await res.json().catch(() => null)) as QuickEstimateResponse | null;
  if (!res.ok || !json || !json.ok) {
    return {
      ok: false,
      error:
        (json && "error" in json && json.error) ||
        "Quick estimate failed. Please try a different photo.",
    };
  }

  return { ok: true, meta: json.meta, data: json.data };
}
