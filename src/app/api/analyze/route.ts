import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import {
  buildWebexStyleRubric,
  roomAnalysisSchema,
  type RoomAnalysis,
} from "@/lib/roomAnalysis";

import type { LanguageModel } from "ai";

export const runtime = "nodejs";

/** Vision + structured output can exceed the default 10s on Vercel; raise where your plan allows. */
export const maxDuration = 120;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

/** Backoff between retries when the provider returns overload / rate-limit style errors. */
const RETRY_WAIT_MS = [2000, 5000, 10000];

/** Retired `-latest` / old Sonnet aliases still show up in Vercel env and break at runtime. */
/** Empty / whitespace env vars should fall through to the next provider option. */
function envPresent(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

function resolveAnthropicModelId(explicit: string | undefined): string {
  const fallback = "claude-sonnet-4-6";
  if (!explicit?.trim()) return fallback;
  const id = explicit.trim();
  // Common dead value seen in dashboards; Anthropic rejects the call.
  if (id === "claude-3-5-sonnet-latest") return fallback;
  return id;
}

function pickVisionModel() {
  // Priority order: Claude (Anthropic) -> Gemini (Google) -> OpenAI
  if (envPresent("ANTHROPIC_API_KEY") || envPresent("ANTHROPIC_AUTH_TOKEN")) {
    const modelId = resolveAnthropicModelId(process.env.ANTHROPIC_MODEL);
    return {
      provider: "anthropic" as const,
      modelId,
      model: anthropic(modelId),
    };
  }

  if (envPresent("GOOGLE_GENERATIVE_AI_API_KEY")) {
    const modelId = process.env.GOOGLE_MODEL ?? "gemini-2.5-flash";
    return {
      provider: "google" as const,
      modelId,
      model: google(modelId),
    };
  }

  if (envPresent("OPENAI_API_KEY")) {
    const modelId = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    return {
      provider: "openai" as const,
      modelId,
      model: openai(modelId),
    };
  }

  return null;
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
  const chosen = pickVisionModel();
  if (!chosen) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing API key. Set one of: ANTHROPIC_API_KEY (Claude), GOOGLE_GENERATIVE_AI_API_KEY (Gemini), or OPENAI_API_KEY.",
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

  const arrayBuffer = await photo.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mediaType = photo.type && photo.type !== "application/octet-stream"
    ? photo.type
    : "image/jpeg";
  const dataUrl = `data:${mediaType};base64,${base64}`;

  const rubric = buildWebexStyleRubric();
  const system = [
    "You are a room-setup expert for collaboration spaces.",
    "You will be given ONE photo of a room and optional reference context.",
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
    schema: roomAnalysisSchema,
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

  async function runModel(model: LanguageModel): Promise<{ output: unknown }> {
    let lastErr: unknown;
    const maxAttempts = 1 + RETRY_WAIT_MS.length;
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
        await sleep(RETRY_WAIT_MS[attempt] ?? 2000);
      }
    }
    throw lastErr;
  }

  try {
    let usedModelId = chosen.modelId;
    let result: { output: unknown };

    try {
      result = await runModel(chosen.model);
    } catch (firstErr) {
      const msg =
        firstErr instanceof Error ? firstErr.message : String(firstErr);
      if (
        chosen.provider !== "anthropic" ||
        !isTransientProviderError(msg)
      ) {
        throw firstErr;
      }
      const fallbackId =
        process.env.ANTHROPIC_FALLBACK_MODEL?.trim() || "claude-haiku-4-5";
      if (fallbackId === chosen.modelId) {
        throw firstErr;
      }
      usedModelId = fallbackId;
      result = await runModel(anthropic(fallbackId));
    }

    const { output } = result;

    // extra runtime validation (defensive in case provider returns partial)
    const parsed = roomAnalysisSchema.safeParse(output);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Model returned invalid structured output." },
        { status: 502 }
      );
    }

    const data: RoomAnalysis = parsed.data;
    return NextResponse.json(
      {
        ok: true,
        meta: { provider: chosen.provider, model: usedModelId },
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

