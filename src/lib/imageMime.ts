/**
 * Detect actual image format from magic bytes. Browsers often set `File.type`
 * from the filename (e.g. `.png`) even when the file is JPEG — Anthropic vision
 * expects `mediaType` to match the payload.
 */
export function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  // GIF
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }
  // WebP: RIFF .... WEBP
  const riff = buffer.toString("ascii", 0, 4);
  const webp = buffer.toString("ascii", 8, 12);
  if (riff === "RIFF" && webp === "WEBP") {
    return "image/webp";
  }
  // ISO BMFF (HEIF / HEIC / AVIF): .... ftyp .... brand
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12).replace(/\0/g, "");
    if (/heic|heix|hevc|heim|heis|mif1/i.test(brand)) {
      return "image/heic";
    }
    if (/avif/i.test(brand)) {
      return "image/avif";
    }
  }

  return null;
}

const ANTHROPIC_VISION_SUPPORTED = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export type PreparedVisionImage = {
  buffer: Buffer;
  mediaType: string;
};

/**
 * Align declared MIME type with bytes for the vision API. Unsupported formats
 * (HEIC/AVIF from many phones) get a clear message — re-export as JPEG/PNG.
 */
export function prepareImageForVision(
  buffer: Buffer,
  declaredMime: string,
): PreparedVisionImage {
  const sniff = detectImageMimeType(buffer);
  let effective =
    sniff ??
    (declaredMime && declaredMime !== "application/octet-stream"
      ? declaredMime
      : "image/jpeg");

  if (
    sniff &&
    declaredMime.startsWith("image/") &&
    sniff !== declaredMime
  ) {
    effective = sniff;
  }

  if (ANTHROPIC_VISION_SUPPORTED.has(effective)) {
    return { buffer, mediaType: effective };
  }

  if (effective === "image/heic" || effective === "image/avif") {
    throw new Error(
      "HEIC/AVIF photos are not supported yet. In Photos: duplicate as JPEG, or AirDrop “Most Compatible”, then upload again.",
    );
  }

  throw new Error(
    "Unsupported image format. Please upload JPEG, PNG, GIF, or WebP.",
  );
}
