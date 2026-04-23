import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import {
  buildWebexStyleRubric,
  roomAnalysisOutputSchema,
  roomAnalysisSchema,
  type RoomAnalysis,
} from "@/lib/roomAnalysis";
import { prepareImageForVision } from "@/lib/imageMime";

import type { LanguageModel } from "ai";

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
  const fb = process.env.ANTHROPIC_FALLBACK_MODEL?.trim() || "claude-haiku-4-5";
  if (fb !== primary) {
    add({ modelId: fb, model: anthropicSdk(fb) });
  }

  return chain;
}

function asString(value: FormDataEntryValue | null): string | null {
  if (typeof value === "string") return value;
  return null;
}

function isImageLike(type: string): boolean {
  return (
    type.startsWith("image/") ||
    type === "application/octet-stream" // some browsers omit a proper mime type
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

  if (!isImageLike(photo.type)) {
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

  const base64 = prepared.buffer.toString("base64");
  const mediaType = prepared.mediaType;
  const dataUrl = `data:${mediaType};base64,${base64}`;

  const rubric = buildWebexStyleRubric();
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
    "Return ONLY valid JSON that matches the provided schema.",
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

  const outputConfig = Output.object({
    schema: roomAnalysisOutputSchema,
    name: "RoomAnalysis",
    description:
      "Estimated room dimensions and collaboration-room improvement recommendations.",
  });

  const messages = [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: userText },
        { type: "image" as const, image: dataUrl, mediaType },
      ],
    },
  ];

  async function runModel(
    model: LanguageModel,
    waitPlan: readonly number[],
  ): Promise<{ output: unknown }> {
    let lastErr: unknown;
    const maxAttempts = 1 + waitPlan.length;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await generateText({
          model,
          system,
          output: outputConfig,
          messages,
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
    let result: { output: unknown } | null = null;
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
          i < visionChain.length - 1 && isTransientProviderError(msg);
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

    const { output } = result;

    // extra runtime validation (defensive in case provider returns partial)
    const parsed = roomAnalysisSchema.safeParse(output);
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
            "Model returned invalid structured output. Try again, or use a JPEG/PNG saved from your camera.",
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

