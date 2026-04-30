import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import {
  anthropicCredentialFromEnv,
  anthropicVisionMessages,
  type AnthropicCredential,
} from "@/lib/anthropicMessages";
import { coerceQuickEstimatePayload } from "@/lib/coerceQuickEstimate";
import { extractBalancedJsonObject } from "@/lib/extractModelJson";
import { prepareImageForVisionAsync } from "@/lib/imageMime";
import {
  quickEstimateSchema,
  type QuickEstimate,
} from "@/lib/quickEstimate";
import { MAX_IMAGE_FILE_BYTES_VERCEL } from "@/lib/uploadLimits";

export const runtime = "nodejs";

export const maxDuration = 120;

const MAX_BYTES = MAX_IMAGE_FILE_BYTES_VERCEL;

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
    m.includes("429")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function qeLog(payload: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      scope: "room-ai/quick-estimate",
      ts: new Date().toISOString(),
      ...payload,
    }),
  );
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
    if (/\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(name)) return true;
  }
  return false;
}

const JSON_SHAPE = [
  "Reply with a single JSON object only (no markdown fences, no commentary). Use exactly this shape:",
  "{",
  '  "seatCount": number,',
  '  "screenCount": number,',
  '  "primaryScreenDiagonalInches": number,',
  '  "notes": string',
  "}",
].join("\n");

export async function POST(request: Request) {
  const rid =
    request.headers.get("x-vercel-id") ??
    request.headers.get("x-request-id") ??
    randomUUID();

  function withRid(
    data: unknown,
    init?: { status?: number; headers?: HeadersInit },
  ) {
    const r = NextResponse.json(data, {
      status: init?.status ?? 200,
      headers: init?.headers,
    });
    r.headers.set("x-quick-estimate-request-id", rid);
    return r;
  }

  const credentials = anthropicCredentialFromEnv();
  if (!credentials) {
    return withRid(
      {
        ok: false,
        error:
          "Missing Anthropic credentials at runtime. Configure ANTHROPIC_API_KEY for this deployment.",
      },
      { status: 500 },
    );
  }

  const anthropicAuth: AnthropicCredential = credentials;

  const modelChain = buildModelIdChain();
  if (modelChain.length === 0) {
    return withRid(
      { ok: false, error: "No models configured." },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return withRid(
      { ok: false, error: "Invalid form upload." },
      { status: 400 },
    );
  }

  const photo = form.get("photo");
  if (!(photo instanceof Blob)) {
    return withRid(
      { ok: false, error: "Missing photo file upload." },
      { status: 400 },
    );
  }

  if (!blobLooksLikeImage(photo)) {
    return withRid(
      { ok: false, error: "Unsupported file type. Please upload an image." },
      { status: 400 },
    );
  }

  if (photo.size > MAX_BYTES) {
    return withRid(
      {
        ok: false,
        error:
          "Image exceeds the hosting upload limit (~4.5 MB per request). Export a smaller JPEG.",
      },
      { status: 400 },
    );
  }

  let prepared;
  try {
    prepared = await prepareImageForVisionAsync(
      Buffer.from(await photo.arrayBuffer()),
      photo.type || "application/octet-stream",
    );
    qeLog({
      rid,
      stage: "image_prepared",
      outBytes: prepared.buffer.length,
      mediaType: prepared.mediaType,
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not process this image.";
    qeLog({ rid, stage: "image_prepare_failed", message: msg.slice(0, 300) });
    return withRid({ ok: false, error: msg }, { status: 400 });
  }

  const mediaType = prepared.mediaType;
  const imageBase64 = prepared.buffer.toString("base64");

  const system = [
    "You estimate collaboration meeting-room metrics from a single photo for Cisco Webex Workspace Designer.",
    "Focus only on: (1) how many seats/chairs the space supports — count visible chairs and infer table capacity or floor seating for the room scale;",
    "(2) how many displays or projector screens serve the meeting (wall-mounted, credenza TVs, dual fronts, etc.);",
    "(3) the diagonal size in inches of the primary collaboration display — use visible cues, pixel density if unknown, or typical sizes for the room width.",
    "Return integers/reasonable numbers even when the photo is partial; explain uncertainty briefly in notes.",
    "",
    JSON_SHAPE,
  ].join("\n");

  const userText = [
    "Task: Fill seatCount, screenCount, primaryScreenDiagonalInches, and notes.",
    "If no chairs are visible, infer seating from table length and room type.",
    "If multiple displays exist, set primaryScreenDiagonalInches to the main front-of-room screen.",
  ].join("\n");

  async function callVision(modelId: string): Promise<string> {
    return anthropicVisionMessages({
      credential: anthropicAuth,
      model: modelId,
      system,
      userText,
      mediaType,
      imageBase64,
      maxTokens: 4096,
      temperature: 0,
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
      qeLog({
        rid,
        stage: "all_models_failed",
        errors: errors.map((e) => e.slice(0, 400)),
      });
      throw new Error(
        errors.length > 0
          ? `Claude models could not complete the request:\n${errors.join("\n")}`
          : "Unknown error during quick estimate."
      );
    }

    if (!assistantOut.trim()) {
      return withRid(
        {
          ok: false,
          error:
            "The model returned an empty answer. Please try again with the same photo.",
        },
        { status: 502 },
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = extractBalancedJsonObject(assistantOut);
    } catch {
      qeLog({
        rid,
        stage: "json_extract_failed",
        model: successModelId,
        assistantChars: assistantOut.length,
      });
      return withRid(
        {
          ok: false,
          error:
            "The model response could not be parsed. Please try again in a moment.",
        },
        { status: 502 },
      );
    }

    const coerced = coerceQuickEstimatePayload(parsedJson);
    const parsed = quickEstimateSchema.safeParse(coerced);
    if (!parsed.success) {
      qeLog({
        rid,
        stage: "zod_validation_failed",
        model: successModelId,
        paths: parsed.error.issues.map((i) => i.path.join(".")),
      });
      return withRid(
        {
          ok: false,
          error:
            "Quick estimate completed but validation failed. Please try again.",
        },
        { status: 502 },
      );
    }

    const data: QuickEstimate = parsed.data;
    return withRid(
      {
        ok: true,
        meta: {
          provider: "anthropic",
          model: successModelId,
        },
        data,
      },
      { status: 200 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during quick estimate.";
    qeLog({
      rid,
      stage: "route_exception",
      message: message.slice(0, 500),
    });
    return withRid({ ok: false, error: message }, { status: 500 });
  }
}
