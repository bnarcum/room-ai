import sharp from "sharp";

/**
 * Known-good Webex-style render asset is ~1024px on the long edge (~0.7MP). Camera
 * photos are multi‑MP with uneven lighting and noise; we downscale to that class of
 * image and apply mild “marketing render” contrast + sharpen so vision sees clean
 * edges and balanced tones like CGI stills (not photoreal noise / blown highlights).
 */
const RENDER_STYLE_LONG_EDGE_PX = 1024;
/** Guard against decompression / huge pixel bombs (≈60MP). */
const MAX_INPUT_PIXELS = 60_000_000;

/** Strip UTF-8 BOM so PNG/JPEG magic bytes are visible. */
export function stripUtf8Bom(buffer: Buffer): Buffer {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return buffer.subarray(3);
  }
  return buffer;
}

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
 * Legacy sync path: align declared MIME with bytes. Prefer
 * {@link prepareImageForVisionAsync} for uploads (phones, large pixels, HEIC).
 */
export function prepareImageForVision(
  buffer: Buffer,
  declaredMime: string,
): PreparedVisionImage {
  const raw = stripUtf8Bom(buffer);
  const sniff = detectImageMimeType(raw);
  const declared = (declaredMime ?? "").trim();
  let effective =
    sniff ??
    (declared && declared !== "application/octet-stream"
      ? declared
      : "image/jpeg");

  if (sniff && declared.startsWith("image/") && sniff !== declared) {
    effective = sniff;
  }

  if (ANTHROPIC_VISION_SUPPORTED.has(effective)) {
    return { buffer: raw, mediaType: effective };
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

/**
 * Convert uploads into a **render-like** still for Anthropic vision (same idea as
 * the known-good sample: modest resolution, even contrast, crisp edges).
 */
async function renderStyleJpeg(
  raw: Buffer,
  withToneMap: boolean,
): Promise<Buffer> {
  let pipeline = sharp(raw, {
    animated: false,
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
  })
    .rotate()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(RENDER_STYLE_LONG_EDGE_PX, RENDER_STYLE_LONG_EDGE_PX, {
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .toColorspace("srgb");

  if (withToneMap) {
    pipeline = pipeline.normalize({ lower: 2, upper: 98 }).sharpen();
  }

  return pipeline
    .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:2:0" })
    .toBuffer();
}

export async function prepareImageForVisionAsync(
  buffer: Buffer,
  declaredMime: string,
): Promise<PreparedVisionImage> {
  const raw = stripUtf8Bom(buffer);
  if (raw.length < 24) {
    throw new Error("Image file is too small or corrupted.");
  }

  try {
    let out: Buffer;
    try {
      out = await renderStyleJpeg(raw, true);
    } catch (toneErr) {
      console.warn(
        JSON.stringify({
          scope: "prepareImageForVisionAsync",
          action: "fallback_no_normalize",
          message:
            toneErr instanceof Error ? toneErr.message.slice(0, 200) : "unknown",
        }),
      );
      out = await renderStyleJpeg(raw, false);
    }

    return { buffer: out, mediaType: "image/jpeg" };
  } catch (e) {
    const sniff = detectImageMimeType(raw);
    const dm = declaredMime.trim().toLowerCase();
    const isHeifFamily =
      sniff === "image/heic" ||
      sniff === "image/avif" ||
      dm === "image/heic" ||
      dm === "image/heif" ||
      dm === "image/avif";

    const inner = e instanceof Error ? e.message : String(e);

    if (isHeifFamily) {
      throw new Error(
        `Could not decode this phone photo (${inner}). On iPhone: Settings → Camera → Formats → “Most Compatible”, then take or export a new JPEG and upload again.`,
      );
    }

    throw new Error(
      `Could not process this image (${inner}). Try a JPEG or PNG export, or a smaller photo.`,
    );
  }
}
