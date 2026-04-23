/**
 * Photorealistic render pipeline using Gemini image-capable models (REST).
 * @see https://ai.google.dev/gemini-api/docs/image-generation
 */

const GEMINI_GENERATE_CONTENT =
  "https://generativelanguage.googleapis.com/v1beta/models";

export type GeminiDesignerImageOk = {
  imageBase64: string;
  mimeType: string;
};

function readInlinePart(part: unknown): GeminiDesignerImageOk | null {
  if (typeof part !== "object" || part === null) return null;
  const p = part as {
    inlineData?: { data?: string; mimeType?: string };
    inline_data?: { data?: string; mime_type?: string };
  };
  const data = p.inlineData?.data ?? p.inline_data?.data;
  if (typeof data !== "string" || data.length === 0) return null;
  const mime =
    p.inlineData?.mimeType ?? p.inline_data?.mime_type ?? "image/png";
  return { imageBase64: data, mimeType: mime };
}

function firstInlineImageFromResponse(parsed: unknown): GeminiDesignerImageOk | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const root = parsed as {
    candidates?: Array<{
      content?: { parts?: unknown[] };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  const block = root.promptFeedback?.blockReason;
  if (block) {
    throw new Error(`Gemini blocked the request (${block}).`);
  }

  const parts = root.candidates?.[0]?.content?.parts;
  if (!parts?.length) {
    return null;
  }

  for (const part of parts) {
    const img = readInlinePart(part);
    if (img) return img;
  }

  return null;
}

export async function geminiPhotorealisticEdit(params: {
  apiKey: string;
  /** e.g. gemini-3.1-flash-image-preview — availability varies by API version. */
  model: string;
  prompt: string;
  pngBase64: string;
}): Promise<GeminiDesignerImageOk> {
  const url = `${GEMINI_GENERATE_CONTENT}/${encodeURIComponent(params.model)}:generateContent`;

  const res = await fetch(`${url}?key=${encodeURIComponent(params.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: params.prompt },
            {
              inlineData: {
                mimeType: "image/png",
                data: params.pngBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  const rawText = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error(
      `Gemini returned non-JSON (HTTP ${res.status}). ${rawText.slice(0, 200)}`,
    );
  }

  if (!res.ok) {
    const msg =
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof (parsed as { error?: { message?: string } }).error?.message ===
        "string"
        ? (parsed as { error: { message: string } }).error.message
        : `Gemini request failed (HTTP ${res.status}).`;
    throw new Error(msg);
  }

  const image = firstInlineImageFromResponse(parsed);
  if (image) return image;

  throw new Error(
    "Gemini did not return an image. Try another model via GEMINI_IMAGE_MODEL or shorten the prompt.",
  );
}
