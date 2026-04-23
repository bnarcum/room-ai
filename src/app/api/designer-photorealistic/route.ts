import { NextResponse } from "next/server";
import sharp from "sharp";

import { DESIGNER_PHOTOREALISTIC_PROMPT } from "@/lib/designerPhotorealisticPrompt";
import { geminiPhotorealisticEdit } from "@/lib/geminiDesignerImage";
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

/** `images/edits` accepts different models depending on account; many keys only allow `dall-e-2`. */
function usesDalle2Family(modelId: string): boolean {
  const m = modelId.trim().toLowerCase();
  return (
    m === "dall-e-2" ||
    m === "dalle2" ||
    m.startsWith("dall-e-2")
  );
}

/** GPT Image models use multipart `image[]`; DALL·E 2 historically uses singular `image`. */
function usesGptImageMultipartArray(modelId: string): boolean {
  const m = modelId.trim().toLowerCase();
  return m.startsWith("gpt-image") || m.startsWith("chatgpt-image");
}

async function openAiPhotorealisticEdit(params: {
  apiKey: string;
  model: string;
  pngBuffer: Buffer;
}): Promise<{ imageBase64: string }> {
  const { apiKey, model, pngBuffer } = params;
  const fd = new FormData();
  fd.append("model", model);
  fd.append("prompt", DESIGNER_PHOTOREALISTIC_PROMPT);
  fd.append("n", "1");
  fd.append("response_format", "b64_json");
  const pngBlob = new Blob([new Uint8Array(pngBuffer)], {
    type: "image/png",
  });
  if (usesGptImageMultipartArray(model)) {
    fd.append("image[]", pngBlob, "input.png");
  } else {
    fd.append("image", pngBlob, "input.png");
  }

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: fd,
  });

  const rawText = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error(
      `OpenAI returned a non-JSON response (HTTP ${res.status}).`,
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
    throw new Error(errMsg);
  }

  const data = parsed as OpenAiEditSuccess;
  const first = data.data?.[0];
  let b64 = first?.b64_json;

  if (!b64 && first?.url) {
    const imgRes = await fetch(first.url);
    if (!imgRes.ok) {
      throw new Error("OpenAI returned a URL but download failed.");
    }
    const ab = await imgRes.arrayBuffer();
    b64 = Buffer.from(ab).toString("base64");
  }

  if (!b64) {
    throw new Error("OpenAI did not return image data.");
  }

  return { imageBase64: b64 };
}

export async function POST(request: Request) {
  const geminiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (!geminiKey && !openaiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing API key. Add GEMINI_API_KEY (recommended) or OPENAI_API_KEY in .env.local / Vercel.",
      },
      { status: 500 },
    );
  }

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

  const raw = Buffer.from(await photo.arrayBuffer());

  /** Prefer Gemini when configured (typical paid AI Studio key). */
  if (geminiKey) {
    let pngBuffer: Buffer;
    try {
      pngBuffer = await sharp(raw)
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Could not process this image.";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    const model =
      process.env.GEMINI_IMAGE_MODEL?.trim() ||
      "gemini-3.1-flash-image-preview";

    try {
      const out = await geminiPhotorealisticEdit({
        apiKey: geminiKey,
        model,
        prompt: DESIGNER_PHOTOREALISTIC_PROMPT,
        pngBase64: pngBuffer.toString("base64"),
      });

      return NextResponse.json({
        ok: true,
        meta: {
          provider: "google",
          model,
        },
        imageBase64: out.imageBase64,
        mimeType: out.mimeType,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gemini image request failed.";
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
  }

  /** OpenAI fallback */
  const model =
    process.env.OPENAI_IMAGE_MODEL?.trim() || "dall-e-2";

  let pngBuffer: Buffer;
  try {
    const base = sharp(raw);
    pngBuffer = usesDalle2Family(model)
      ? await base
          .resize(1024, 1024, {
            fit: "contain",
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .png({ compressionLevel: 9 })
          .toBuffer()
      : await base.png({ compressionLevel: 9 }).toBuffer();
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not process this image.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  if (!openaiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing OPENAI_API_KEY for OpenAI fallback." },
      { status: 500 },
    );
  }

  try {
    const { imageBase64 } = await openAiPhotorealisticEdit({
      apiKey: openaiKey,
      model,
      pngBuffer,
    });

    return NextResponse.json({
      ok: true,
      meta: {
        provider: "openai",
        model,
      },
      imageBase64,
      mimeType: "image/png",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI image request failed.";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
