import { NextResponse } from "next/server";
import { generateText } from "ai";
import {
  createAnthropic,
  type AnthropicLanguageModelOptions,
} from "@ai-sdk/anthropic";
import {
  buildWebexStyleRubric,
  roomAnalysisSchema,
  type RoomAnalysis,
} from "@/lib/roomAnalysis";
import { coerceRoomAnalysisPayload } from "@/lib/coerceRoomAnalysis";
import { extractBalancedJsonObject } from "@/lib/extractModelJson";
import { prepareImageForVision } from "@/lib/imageMime";
import { combinedAssistantText } from "@/lib/modelResponseText";

import type { LanguageModel } from "ai";

/** Avoid adaptive/extended thinking consuming the whole output budget with no JSON in `text`. */
const anthropicVisionProviderOptions = {
  anthropic: {
    thinking: { type: "disabled" as const },
    sendReasoning: false,
  } satisfies AnthropicLanguageModelOptions,
};

export const runtime = "nodejs";

/** Vision + structured output can exceed the default 10s on Vercel; raise where your plan allows. */
export const maxDuration = 120;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

/** Backoff between retries when the provider returns overload / rate-limit style errors. */
const RETRY_WAIT_MS = [2000, 5000, 10000];
/** Lighter retries when failing over to the next provider (stay within serverless time limits). */
const FAILOVER_RETRY_MS = [2500];

/** Retired `-latest` / old Sonnet aliases still show up in Vercel env and break at runtime. */

function trimmedEnv(key: string): string | undefined {
  const v = process.env[key];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Explicit credentials so we accept common alternate names and Bearer auth.
 * The default `anthropic()` client only reads ANTHROPIC_API_KEY automatically.
 */
function anthropicProviderFromEnv() {
  const authToken = trimmedEnv("ANTHROPIC_AUTH_TOKEN");
  if (authToken) {
    return createAnthropic({ authToken });
  }
  const apiKey =
    trimmedEnv("ANTHROPIC_API_KEY") ??
    trimmedEnv("ANTHROPIC_KEY") ??
    trimmedEnv("CLAUDE_API_KEY");
  if (apiKey) {
    return createAnthropic({ apiKey });
  }
  return null;
}

function resolveAnthropicModelId(explicit: string | undefined): string {
  const fallback = "claude-sonnet-4-6";
  if (!explicit?.trim()) return fallback;
  const id = explicit.trim();
  // Common dead value seen in dashboards; Anthropic rejects the call.
  if (id === "claude-3-5-sonnet-latest") return fallback;
  return id;
}

/** Dated snapshot IDs are most reliable across API versions. */
function resolveFallbackModelId(explicit: string | undefined): string {
  const fallback = "claude-haiku-4-5-20251001";
  if (!explicit?.trim()) return fallback;
  const id = explicit.trim();
  if (id === "claude-3-5-sonnet-latest") return fallback;
  return id;
}

function isAuthLikeError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("401") ||
    m.includes("403") ||
    m.includes("invalid api key") ||
    m.includes("x-api-key") ||
    m.includes("authentication") ||
    m.includes("permission denied")
  );
}

type VisionStep = {
  modelId: string;
  model: LanguageModel;
};

/** Primary Claude model, then optional Haiku fallback if Anthropic is overloaded. */
function buildVisionChain(): VisionStep[] {
  const chain: VisionStep[] = [];
  const dedupe = new Set<string>();

  function add(step: VisionStep) {
    if (dedupe.has(step.modelId)) return;
    dedupe.add(step.modelId);
    chain.push(step);
  }

  const anthropicSdk = anthropicProviderFromEnv();
  if (!anthropicSdk) {
    return chain;
  }

  const primary = resolveAnthropicModelId(process.env.ANTHROPIC_MODEL);
  add({
    modelId: primary,
    model: anthropicSdk(primary),
  });
  const fb = resolveFallbackModelId(process.env.ANTHROPIC_FALLBACK_MODEL);
  if (fb !== primary) {
    add({ modelId: fb, model: anthropicSdk(fb) });
  }

  return chain;
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

export async function POST(request: Request) {
  const visionChain = buildVisionChain();
  if (visionChain.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing Anthropic credentials at runtime. In Vercel open Settings → Environment Variables: add ANTHROPIC_API_KEY (your sk-ant-… key), enable it for Production (not only Preview), Save, then Redeploy the latest deployment. Alternate names ANTHROPIC_KEY or CLAUDE_API_KEY are supported.",
      },
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
  // `File` in some runtimes is a `Blob` only; both support type, size, arrayBuffer.
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
  const imageDataUrl = `data:${mediaType};base64,${prepared.buffer.toString("base64")}`;

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

  const messages = [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: userText },
        /** Data URLs match Anthropic examples and avoid Buffer serialization edge cases in bundlers. */
        { type: "image" as const, image: imageDataUrl },
      ],
    },
  ];

  async function runModel(
    model: LanguageModel,
    waitPlan: readonly number[],
  ): Promise<{ text: string }> {
    let lastErr: unknown;
    const maxAttempts = 1 + waitPlan.length;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await generateText({
          model,
          system,
          messages,
          temperature: 0.25,
          maxOutputTokens: 16384,
          providerOptions: anthropicVisionProviderOptions,
        });
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const canRetry =
          isTransientProviderError(msg) && attempt < maxAttempts - 1;
        if (!canRetry) throw err;
        await sleep(waitPlan[attempt] ?? 2000);
      }
    }
    throw lastErr;
  }

  try {
    const errors: string[] = [];
    let result: { text: string } | null = null;
    let successStep: VisionStep | null = null;

    for (let i = 0; i < visionChain.length; i++) {
      const step = visionChain[i];
      // First hop (usually primary Claude) gets full backoff; later hops failover faster.
      const waits = i === 0 ? RETRY_WAIT_MS : FAILOVER_RETRY_MS;
      try {
        result = await runModel(step.model, waits);
        successStep = step;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${step.modelId}: ${msg}`);
        const canFailover =
          i < visionChain.length - 1 && !isAuthLikeError(msg);
        if (!canFailover) {
          throw new Error(
            errors.length > 1
              ? `Claude models could not complete the request:\n${errors.join("\n")}`
              : msg
          );
        }
      }
    }

    if (!result || !successStep) {
      throw new Error(
        errors.length > 0
          ? `Claude models could not complete the request:\n${errors.join("\n")}`
          : "Unknown error during analysis."
      );
    }

    const assistantOut = combinedAssistantText(result);
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
          model: successStep.modelId,
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

