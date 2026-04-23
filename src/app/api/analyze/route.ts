import { randomUUID } from "node:crypto";

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
import { prepareImageForVisionAsync } from "@/lib/imageMime";
import { MAX_IMAGE_FILE_BYTES_VERCEL } from "@/lib/uploadLimits";
import {
  buildWorkspaceDesignerRenderSystem,
  WORKSPACE_DESIGNER_RENDER_USER_FOOTER,
} from "@/lib/workspaceDesignerRenderPrompt";

export const runtime = "nodejs";

/** Vision + JSON can exceed default function timeout on cold starts. */
export const maxDuration = 120;

/** Same cap as client (`uploadLimits.ts`) — whole POST must stay under ~4.5 MiB on Vercel. */
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

/** Structured stderr for Vercel runtime logs (no secrets; redact long blobs). */
function analyzeLog(payload: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      scope: "room-ai/analyze",
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
    r.headers.set("x-analyze-request-id", rid);
    return r;
  }

  const credentials = anthropicCredentialFromEnv();
  if (!credentials) {
    return withRid(
      {
        ok: false,
        error:
          "Missing Anthropic credentials at runtime. In Vercel open Settings → Environment Variables: add ANTHROPIC_API_KEY (your sk-ant-… key), enable it for Production (not only Preview), Save, then Redeploy the latest deployment. Alternate names ANTHROPIC_KEY or CLAUDE_API_KEY are supported.",
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
          "Image exceeds the hosting upload limit (~4.5 MB per request). Export a smaller JPEG — the site also compresses large photos automatically before sending.",
      },
      { status: 400 },
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
  /** `workspace-designer-render` = CGI / isometric export; default = real photo flow. */
  const analysisContext = asString(form.get("context")) ?? "room-photo";
  const isWorkspaceDesignerRender =
    analysisContext === "workspace-designer-render";

  let prepared;
  try {
    prepared = await prepareImageForVisionAsync(
      Buffer.from(await photo.arrayBuffer()),
      photo.type || "application/octet-stream",
    );
    analyzeLog({
      rid,
      stage: "image_prepared",
      context: analysisContext,
      outBytes: prepared.buffer.length,
      mediaType: prepared.mediaType,
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not process this image.";
    analyzeLog({
      rid,
      stage: "image_prepare_failed",
      message: msg.slice(0, 300),
    });
    return withRid({ ok: false, error: msg }, { status: 400 });
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
    '  "observedItems": {',
    '    "electronicsAndDevices": string[],',
    '    "plantsAndDecor": string[],',
    '    "otherNotable": string[]',
    "  },",
    '  "recommendations": {',
    '    "camera": string[], "lighting": string[], "acoustics": string[], "display": string[],',
    '    "seating": string[], "cabling": string[], "network": string[], "power": string[]',
    "  },",
    '  "quickChecklist": string[] (at least 3 items)',
    "}",
  ].join("\n");

  const system = isWorkspaceDesignerRender
    ? buildWorkspaceDesignerRenderSystem(rubric, jsonShape)
    : [
        "You are a room-setup expert for collaboration spaces.",
        "You will be given ONE photo of a room and optional reference context.",
        "Photos may show full conference rooms, home offices, compact corners, standing desks, mixed furniture, or partial views — still produce best-effort dimensions and constraints.",
        "Photos may be real-world camera shots (glare, shadows, clutter, motion blur, odd angles) or clean marketing/render images — treat both the same: estimate anyway; never refuse analysis.",
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
    isWorkspaceDesignerRender ? WORKSPACE_DESIGNER_RENDER_USER_FOOTER : null,
    isWorkspaceDesignerRender
      ? "Task: Evaluate this Workspace Designer render for hybrid-meeting readiness; estimate dimensions from depicted geometry and scale cues; fill observedItems with every visible collaboration-relevant object (displays, codecs/bars, cameras, seating, laptops, plants, decor). Name items consistently when you reference them in recommendations or quickChecklist."
      : "Task: Estimate length, width, height. Fill observedItems with visible laptops, plants, decor, and other notable objects (use empty arrays only when nothing applies). When you cite those items in recommendations or quickChecklist, name them the same way here first.",
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
      analyzeLog({
        rid,
        stage: "all_models_failed",
        errors: errors.map((e) => e.slice(0, 400)),
      });
      throw new Error(
        errors.length > 0
          ? `Claude models could not complete the request:\n${errors.join("\n")}`
          : "Unknown error during analysis."
      );
    }

    if (!assistantOut.trim()) {
      analyzeLog({ rid, stage: "empty_assistant_text", model: successModelId });
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
      analyzeLog({
        rid,
        stage: "json_extract_failed",
        model: successModelId,
        assistantChars: assistantOut.length,
        assistantHead: assistantOut.slice(0, 120).replace(/\s+/g, " "),
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

    const coerced = coerceRoomAnalysisPayload(parsedJson);
    const parsed = roomAnalysisSchema.safeParse(coerced);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      analyzeLog({
        rid,
        stage: "zod_validation_failed",
        model: successModelId,
        paths: parsed.error.issues.map((i) => i.path.join(".")),
      });
      const detail =
        process.env.NODE_ENV === "development"
          ? JSON.stringify(flat.fieldErrors ?? flat.formErrors)
          : undefined;
      return withRid(
        {
          ok: false,
          error:
            "Analysis completed but validation failed. Please try again, or use a smaller photo.",
          ...(detail ? { debug: detail } : {}),
        },
        { status: 502 },
      );
    }

    const data: RoomAnalysis = parsed.data;
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
      err instanceof Error ? err.message : "Unknown error during analysis.";
    analyzeLog({
      rid,
      stage: "route_exception",
      message: message.slice(0, 500),
    });
    return withRid({ ok: false, error: message }, { status: 500 });
  }
}
