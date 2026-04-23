import { NextResponse } from "next/server";
import sharp from "sharp";

import { DESIGNER_PHOTOREALISTIC_PROMPT } from "@/lib/designerPhotorealisticPrompt";
import { MAX_IMAGE_FILE_BYTES_VERCEL } from "@/lib/uploadLimits";

export const runtime = "nodejs";

/** Image generation + upload can exceed default serverless timeout. */
export const maxDuration = 300;

const MAX_BYTES = MAX_IMAGE_FILE_BYTES_VERCEL;

function blobLooksLikeImage(blob: Blob): boolean {
  const t = (blob.type ?? "").trim().toLowerCase();
  if (t.startsWith("image/") || t === "application/octet-stream") return true;
  if (typeof File !== "undefined" && blob instanceof File) {
    const name = blob.name?.toLowerCase() ?? "";
    if (/\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(name)) return true;
  }
  return false;
}

type OpenAiEditSuccess = {
  data?: Array<{ b64_json?: string; url?: string }>;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing OPENAI_API_KEY. Add it in .env.local (local) or Vercel → Environment Variables for image generation.",
      },
      { status: 500 },
    );
  }

  const model =
    process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid form upload." },
      { status: 400 },
    );
  }

  const photo = form.get("photo");
  if (!(photo instanceof Blob)) {
    return NextResponse.json(
      { ok: false, error: "Missing image file." },
      { status: 400 },
    );
  }

  if (!blobLooksLikeImage(photo)) {
    return NextResponse.json(
      { ok: false, error: "Unsupported file type. Please upload an image." },
      { status: 400 },
    );
  }

  if (photo.size > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Image exceeds the upload limit (~4.5 MB per request). Export a smaller PNG or JPEG from Workspace Designer.",
      },
      { status: 400 },
    );
  }

  let pngBuffer: Buffer;
  try {
    const raw = Buffer.from(await photo.arrayBuffer());
    pngBuffer = await sharp(raw)
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not process this image.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  // Only send fields accepted by `POST /v1/images/edits`. Extra fields like
  // `quality` / `size` / `background` can return "Unknown parameter" depending on
  // API version and model — keep the request minimal.
  const fd = new FormData();
  fd.append("model", model);
  fd.append("prompt", DESIGNER_PHOTOREALISTIC_PROMPT);
  fd.append("n", "1");
  fd.append("response_format", "b64_json");
  fd.append(
    "image[]",
    new Blob([new Uint8Array(pngBuffer)], { type: "image/png" }),
    "input.png",
  );

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: fd,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Network error calling OpenAI. Try again." },
      { status: 502 },
    );
  }

  const rawText = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: `OpenAI returned a non-JSON response (HTTP ${res.status}).`,
      },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const errMsg =
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof (parsed as { error?: { message?: string } }).error?.message ===
        "string"
        ? (parsed as { error: { message: string } }).error.message
        : `OpenAI image edit failed (HTTP ${res.status}).`;
    return NextResponse.json({ ok: false, error: errMsg }, { status: 502 });
  }

  const data = parsed as OpenAiEditSuccess;
  const first = data.data?.[0];
  let b64 = first?.b64_json;

  if (!b64 && first?.url) {
    try {
      const imgRes = await fetch(first.url);
      if (!imgRes.ok) {
        return NextResponse.json(
          { ok: false, error: "OpenAI returned a URL but download failed." },
          { status: 502 },
        );
      }
      const ab = await imgRes.arrayBuffer();
      b64 = Buffer.from(ab).toString("base64");
    } catch {
      return NextResponse.json(
        { ok: false, error: "Could not fetch generated image URL from OpenAI." },
        { status: 502 },
      );
    }
  }

  if (!b64) {
    return NextResponse.json(
      { ok: false, error: "OpenAI did not return image data." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    meta: {
      provider: "openai",
      model,
    },
    imageBase64: b64,
    mimeType: "image/png",
  });
}
