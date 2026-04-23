import { NextResponse } from "next/server";
import {
  buildWebexStyleRubric,
  roomAnalysisSchema,
  type RoomAnalysis,
} from "@/lib/roomAnalysis";
import {
  anthropicCredentialFromEnv,
  anthropicVisionMessages,
  type AnthropicCredential,
} from "@/lib/anthropicMessages";
import { coerceRoomAnalysisPayload } from "@/lib/coerceRoomAnalysis";
import { extractBalancedJsonObject } from "@/lib/extractModelJson";
import { prepareImageForVision } from "@/lib/imageMime";

export const runtime = "nodejs";

/** Vision + JSON can exceed default function timeout on cold starts. */
export const maxDuration = 120;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

const RETRY_WAIT_MS = [2000, 5000, 10000];
const FAILOVER_RETRY_MS = [2500];

function resolveAnthropicModelId(explicit: string | undefined): string {
  const fallback = "claude-sonnet-4-6";
  if (!explicit?.trim()) return fallback;
  const id = explicit.trim();
  if (id === "claude-3-5-sonnet-latest") return fallback;
  return id;
}

function resolveFallbackModelId(explicit: string | undefined): string {
  const fallback = "claude-haiku-4-5-20251001";
  if (!explicit?.trim()) return fallback;
  const id = explicit.trim();
  if (id === "claude-3-5-sonnet-latest") return fallback;
  return id;
}

/** Unique model ids: primary then optional fallback. */
function buildModelIdChain(): string[] {
  const primary = resolveAnthropicModelId(process.env.ANTHROPIC_MODEL);
  const fb = resolveFallbackModelId(process.env.ANTHROPIC_FALLBACK_MODEL);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [primary, fb]) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function isAuthLikeError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("401") ||
    m.includes("403") ||
    m.includes("invalid api key") ||
    m.includes("authentication") ||
    m.includes("permission denied")
  );
}

function isTransientProviderError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("high demand") ||
    m.includes("overloaded") ||
    m.includes("capacity") ||
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("temporarily") ||
    m.includes("try again later") ||
    m.includes("experiencing") ||
    m.includes("failed after") ||
    m.includes("503") ||
    m.includes("529") ||
    m.includes("429") ||
    /\b503\b/.test(message) ||
    /\b529\b/.test(message) ||
    /\b429\b/.test(message)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asString(value: FormDataEntryValue | null): string | null {
  if (typeof value === "string") return value;
  return null;
}

function blobLooksLikeImage(blob: Blob): boolean {
  const t = (blob.type ?? "").trim().toLowerCase();
  if (t.startsWith("image/") || t === "application/octet-stream") return true;
  if (typeof File !== "undefined" && blob instanceof File) {
    const name = blob.name?.toLowerCase() ?? "";
    if (/\.(jpe?g|png|gif|webp)$/i.test(name)) return true;
  }
  return false;
}

export async function POST(request: Request) {
  const credentials = anthropicCredentialFromEnv();
  if (!credentials) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing Anthropic credentials at runtime. In Vercel open Settings → Environment Variables: add ANTHROPIC_API_KEY (your sk-ant-… key), enable it for Production (not only Preview), Save, then Redeploy the latest deployment. Alternate names ANTHROPIC_KEY or CLAUDE_API_KEY are supported.",
      },
      { status: 500 }
    );
  }

  const anthropicAuth: AnthropicCredential = credentials;

  const modelChain = buildModelIdChain();
  if (modelChain.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No models configured." },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid form upload." },
      { status: 400 }
    );
  }

  const photo = form.get("photo");
  if (!(photo instanceof Blob)) {
    return NextResponse.json(
      { ok: false, error: "Missing photo file upload." },
      { status: 400 }
    );
  }

  if (!blobLooksLikeImage(photo)) {
    return NextResponse.json(
      { ok: false, error: "Unsupported file type. Please upload an image." },
      { status: 400 }
    );
  }

  if (photo.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Image is too large. Please upload a smaller photo." },
      { status: 400 }
    );
  }

  const reference =
    asString(form.get("reference")) ??
    ("none" as
      | "none"
      | "credit-card"
      | "a4-letter-paper"
      | "known-ceiling-height");

  const unit = (asString(form.get("unit")) ?? "feet") as "feet" | "meters";
  const knownCeilingHeight = asString(form.get("knownCeilingHeight")) ?? "";

  let prepared;
  try {
    prepared = prepareImageForVision(
      Buffer.from(await photo.arrayBuffer()),
      photo.type || "application/octet-stream",
    );
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not process this image.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const mediaType = prepared.mediaType;
  const imageBase64 = prepared.buffer.toString("base64");

  const rubric = buildWebexStyleRubric();
  const jsonShape = [
    "Reply with a single JSON object only (no markdown fences, no commentary). Use this shape:",
    '{',
    '  "dimensions": {',
    '    "unit": "feet" | "meters",',
    '    "length": number, "width": number, "height": number,',
    '    "confidence": number between 0 and 1,',
    '    "reasoning": string',
    "  },",
    '  "detectedReference": { "type": string, "notes": string },',
    '  "roomSummary": {',
    '    "likelyUse": string,',
    '    "occupancy": integer (0 if unknown),',
    '    "keyConstraints": string[]',
    "  },",
    '  "recommendations": {',
    '    "camera": string[], "lighting": string[], "acoustics": string[], "display": string[],',
    '    "seating": string[], "cabling": string[], "network": string[], "power": string[]',
    "  },",
    '  "quickChecklist": string[] (at least 3 items)',
    "}",
  ].join("\n");

  const system = [
    "You are a room-setup expert for collaboration spaces.",
    "You will be given ONE photo of a room and optional reference context.",
    "Photos may show full conference rooms, home offices, compact corners, standing desks, mixed furniture, or partial views — still produce best-effort dimensions and constraints.",
    "Estimate room length/width/height as a rough estimate.",
    "If the estimate is uncertain, lower confidence and explain why.",
    "Then provide practical improvement suggestions aligned to a Webex-style room design rubric.",
    "",
    rubric,
    "",
    jsonShape,
  ].join("\n");

  const userText = [
    `Preferred unit: ${unit}.`,
    `Reference: ${reference}.`,
    reference === "known-ceiling-height" && knownCeilingHeight
      ? `Known ceiling height: ${knownCeilingHeight}. Use it to anchor the estimate.`
      : "No known ceiling height provided.",
    "Task: Estimate length, width, height. Then produce categorized recommendations.",
  ]
    .filter(Boolean)
    .join("\n");

  async function callVision(modelId: string): Promise<string> {
    return anthropicVisionMessages({
      credential: anthropicAuth,
      model: modelId,
      system,
      userText,
      mediaType,
      imageBase64,
      maxTokens: 16384,
      temperature: 0.25,
    });
  }

  async function callWithBackoff(
    modelId: string,
    waits: readonly number[],
  ): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= waits.length; attempt++) {
      try {
        return await callVision(modelId);
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        const willRetry =
          attempt < waits.length && isTransientProviderError(msg);
        if (!willRetry) throw e;
        await sleep(waits[attempt] ?? 2000);
      }
    }
    throw lastErr;
  }

  try {
    const errors: string[] = [];
    let assistantOut = "";
    let successModelId = "";

    for (let i = 0; i < modelChain.length; i++) {
      const modelId = modelChain[i];
      const waits = i === 0 ? RETRY_WAIT_MS : FAILOVER_RETRY_MS;
      try {
        assistantOut = await callWithBackoff(modelId, waits);
        successModelId = modelId;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${modelId}: ${msg}`);
        const canFailover =
          i < modelChain.length - 1 && !isAuthLikeError(msg);
        if (!canFailover) {
          throw new Error(
            errors.length > 1
              ? `Claude models could not complete the request:\n${errors.join("\n")}`
              : msg
          );
        }
      }
    }

    if (!successModelId) {
      throw new Error(
        errors.length > 0
          ? `Claude models could not complete the request:\n${errors.join("\n")}`
          : "Unknown error during analysis."
      );
    }

    if (!assistantOut.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The model returned an empty answer. Please try again with the same photo.",
        },
        { status: 502 }
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = extractBalancedJsonObject(assistantOut);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The model response could not be parsed. Please try again in a moment.",
        },
        { status: 502 }
      );
    }

    const coerced = coerceRoomAnalysisPayload(parsedJson);
    const parsed = roomAnalysisSchema.safeParse(coerced);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const detail =
        process.env.NODE_ENV === "development"
          ? JSON.stringify(flat.fieldErrors ?? flat.formErrors)
          : undefined;
      return NextResponse.json(
        {
          ok: false,
          error:
            "Analysis completed but validation failed. Please try again, or use a smaller photo.",
          ...(detail ? { debug: detail } : {}),
        },
        { status: 502 }
      );
    }

    const data: RoomAnalysis = parsed.data;
    return NextResponse.json(
      {
        ok: true,
        meta: {
          provider: "anthropic",
          model: successModelId,
        },
        data,
      },
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during analysis.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
