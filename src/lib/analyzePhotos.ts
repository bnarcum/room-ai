/** Primary + optional extra room angles for /api/analyze (max 3). */

export const MAX_ANALYZE_PHOTOS = 3;

export type VisionImagePart = {
  mediaType: string;
  imageBase64: string;
};

function pushUniqueBlob(out: Blob[], seen: Set<Blob>, entry: FormDataEntryValue | null) {
  if (!(entry instanceof Blob) || entry.size <= 0) return;
  if (seen.has(entry)) return;
  seen.add(entry);
  out.push(entry);
}

/**
 * Accepts `photo` (primary) plus `photo2`/`photo3`, or repeated `photos`.
 * First collected blob is the primary view.
 */
export function collectAnalyzePhotoBlobs(form: FormData): Blob[] {
  const out: Blob[] = [];
  const seen = new Set<Blob>();

  pushUniqueBlob(out, seen, form.get("photo"));
  for (const entry of form.getAll("photos")) {
    pushUniqueBlob(out, seen, entry);
  }
  pushUniqueBlob(out, seen, form.get("photo2"));
  pushUniqueBlob(out, seen, form.get("photo3"));

  return out.slice(0, MAX_ANALYZE_PHOTOS);
}

export function normalizeVisionImages(params: {
  mediaType?: string;
  imageBase64?: string;
  images?: VisionImagePart[];
}): VisionImagePart[] {
  if (params.images && params.images.length > 0) {
    return params.images.slice(0, MAX_ANALYZE_PHOTOS);
  }
  if (params.mediaType && params.imageBase64) {
    return [{ mediaType: params.mediaType, imageBase64: params.imageBase64 }];
  }
  throw new Error("Missing image for vision request.");
}
