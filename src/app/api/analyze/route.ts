import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { collectAnalyzePhotoBlobs } from "@/lib/analyzePhotos";
import {
  buildWebexStyleRubric,
  roomAnalysisSchema,
  type RoomAnalysis,
} from "@/lib/roomAnalysis";
import {
  coerceRoomAnalysisPayload,
  parseKnownCeilingHeight,
} from "@/lib/coerceRoomAnalysis";
import { extractBalancedJsonObject } from "@/lib/extractModelJson";
import { prepareImageForVisionAsync } from "@/lib/imageMime";
import { MAX_IMAGE_FILE_BYTES_VERCEL } from "@/lib/uploadLimits";
import {
  buildVisionProviderChain,
  missingVisionCredentialsMessage,
  runVisionJsonWithFallback,
} from "@/lib/visionProviders";
import {
  buildWorkspaceDesignerRenderSystem,
  WORKSPACE_DESIGNER_RENDER_USER_FOOTER,
} from "@/lib/workspaceDesignerRenderPrompt";

export const runtime = "nodejs";

/** Vision + JSON can exceed default function timeout on cold starts. */
export const maxDuration = 120;

/** Same cap as client (`uploadLimits.ts`) — whole POST must stay under ~4.5 MiB on Vercel. */
const MAX_BYTES = MAX_IMAGE_FILE_BYTES_VERCEL;

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

  if (buildVisionProviderChain().length === 0) {
    return withRid(
      {
        ok: false,
        error: missingVisionCredentialsMessage(),
      },
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

  const photos: Blob[] = [];
  let usedBytes = 0;
  for (const candidate of collectAnalyzePhotoBlobs(form)) {
    if (!blobLooksLikeImage(candidate)) {
      if (photos.length === 0) {
        return withRid(
          { ok: false, error: "Unsupported file type. Please upload an image." },
          { status: 400 },
        );
      }
      continue;
    }
    if (candidate.size > MAX_BYTES) {
      if (photos.length === 0) {
        return withRid(
          {
            ok: false,
            error:
              "Image exceeds the hosting upload limit (~4.5 MB per request). Export a smaller JPEG — the site also compresses large photos automatically before sending.",
          },
          { status: 400 },
        );
      }
      continue;
    }
    if (usedBytes + candidate.size > MAX_BYTES) {
      continue;
    }
    photos.push(candidate);
    usedBytes += candidate.size;
  }

  if (photos.length === 0) {
    return withRid(
      { ok: false, error: "Missing photo file upload." },
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

  const visionImages: { mediaType: string; imageBase64: string }[] = [];
  try {
    for (const photo of photos) {
      const prepared = await prepareImageForVisionAsync(
        Buffer.from(await photo.arrayBuffer()),
        photo.type || "application/octet-stream",
      );
      visionImages.push({
        mediaType: prepared.mediaType,
        imageBase64: prepared.buffer.toString("base64"),
      });
    }
    analyzeLog({
      rid,
      stage: "image_prepared",
      context: analysisContext,
      photoCount: visionImages.length,
      outBytes: visionImages.reduce(
        (n, image) => n + Buffer.byteLength(image.imageBase64, "base64"),
        0,
      ),
      mediaType: visionImages[0]?.mediaType,
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

  const rubric = buildWebexStyleRubric();
  const jsonShape = [
    "Reply with a single JSON object only (no markdown fences, no commentary). Use this shape:",
    '{',
    '  "dimensions": {',
    '    "unit": "feet" | "meters",',
    '    "length": number, "width": number, "height": number,  // midpoints for exports',
    '    "lengthMin": number, "lengthMax": number,',
    '    "widthMin": number, "widthMax": number,',
    '    "heightMin": number, "heightMax": number,',
    '    "confidence": number between 0 and 1,',
    '    "reasoning": string',
    "  },",
    '  "detectedReference": { "type": "door"|"table"|"chair"|"ceiling"|"known-ceiling-height"|"credit-card"|"a4-letter-paper"|"none", "notes": string },',
    '  "roomSummary": {',
    '    "likelyUse": string,',
    '    "occupancy": integer (0 if unknown),',
    '    "primaryScreenDiagonalInches": number,',
    '    "screenCount": integer,',
    '    "keyConstraints": string[]',
    "  },",
    '  "observedItems": {',
    '    "electronicsAndDevices": string[],',
    '    "plantsAndDecor": string[],',
    '    "otherNotable": string[]',
    "  },",
    '  "recommendations": {',
    '    "camera": string[], "display": string[], "acoustics": string[], "lighting": string[], "network": string[],',
    '    "seating": string[], "cabling": string[], "power": string[]',
    "  },",
    '  "quickChecklist": string[] (at least 3 items),',
    '  "focusRegions": {',
    '    "camera"?: { "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1 },',
    '    "display"?: { "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1 },',
    '    "acoustics"?: { "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1 },',
    '    "lighting"?: { "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1 },',
    '    "network"?: { "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1 }',
    "  }",
    "}",
  ].join("\n");

  const system = isWorkspaceDesignerRender
    ? buildWorkspaceDesignerRenderSystem(rubric, jsonShape)
    : [
        "You are a room-setup expert for collaboration spaces.",
        "You will be given one or more photos of the same room and optional reference context.",
        "The FIRST image is the PRIMARY view (hero). Later images are extra angles for context — use all views and estimate from the combined evidence.",
        "focusRegions boxes are relative to the PRIMARY photo only (the first image). Omit a key if that object is not visible in the primary photo.",
        "Photos may show full conference rooms, home offices, compact corners, standing desks, mixed furniture, or partial views — still produce best-effort dimensions and constraints.",
        "Photos may be real-world camera shots (glare, shadows, clutter, motion blur, odd angles) or clean marketing/render images — treat both the same: estimate anyway; never refuse analysis.",
        "Size the room as directional ranges (min/max) plus midpoints. Do not present a single L×W×H as if it were surveyed.",
        "Scale from visible reference objects in this order when present: door (~36 in / 0.9 m), table, chair, ceiling tile/height, known ceiling height from the user.",
        "If the estimate is uncertain, widen the ranges, lower confidence, and explain why.",
        "Then provide practical improvement suggestions aligned to a Webex-style room design rubric.",
        "",
        "Room type (likelyUse) — this drives seating. Get it right:",
        "- home or small-office: standing desk, consumer TV on a dresser/console, one task chair, laptop-only workspace, bedroom/office mix. occupancy = visible chairs (usually 1, max 2). Typical height 8–9 ft, not 10.",
        "- conference or classroom: dedicated meeting table with several chairs facing a collaboration display. occupancy = visible chairs, not floor-area capacity.",
        "- Standing desk + consumer TV + one chair is home or small-office. Never label that a conference or meeting room.",
        "",
        "Recommendations discipline:",
        "- Prioritize five photo-grounded categories: camera, display, acoustics (audio), lighting, network. Still fill seating, cabling, and power.",
        "- Every recommendations.* array must contain at least two distinct, specific strings.",
        "- Each string is ONE short sentence (max ~90 characters). Do not paste raw URLs into the sentence.",
        "- If you cite Cisco or Webex guidance, append markdown only: [Cisco guidance](https://www.cisco.com/c/en/us/products/collaboration-endpoints/index.html).",
        "- Ground advice in what is visible in the photo or render; where visibility is limited, say so and suggest a safe default.",
        "- Add focusRegions boxes only for objects actually in the PRIMARY photo (TV, monitor, chair, lights, window, desk). Coordinates are 0–1 from the top-left of the first image. Omit a key if that object is not visible there.",
        "- Do not repeat one generic sentence across every category.",
        "",
        rubric,
        "",
        jsonShape,
      ].join("\n");

  const userText = [
    `Preferred unit: ${unit}.`,
    `Reference: ${reference}.`,
    reference === "known-ceiling-height" && knownCeilingHeight
      ? `Known ceiling height: ${knownCeilingHeight}. Use it to anchor heightMin/heightMax.`
      : "No known ceiling height provided. Use door, table, chair, or ceiling cues.",
    isWorkspaceDesignerRender ? WORKSPACE_DESIGNER_RENDER_USER_FOOTER : null,
    visionImages.length > 1
      ? `You have ${visionImages.length} photos. Image 1 is primary; images 2+ are extra angles. Use all views; estimate from combined evidence. focusRegions must be relative to image 1 only.`
      : null,
    isWorkspaceDesignerRender
      ? "Task: Evaluate this Workspace Designer render for hybrid-meeting readiness; estimate dimension ranges from depicted geometry and scale cues; fill observedItems with every visible collaboration-relevant object (displays, codecs/bars, cameras, seating, laptops, plants, decor). Name items consistently when you reference them in recommendations or quickChecklist."
      : "Task: Estimate directional length/width/height ranges plus midpoints. Classify home/small-office vs conference from furniture (standing desk + consumer TV + one chair = home or small-office). occupancy is visible chairs only. Fill observedItems from the photo(s). Estimate primaryScreenDiagonalInches. Write short camera, display, audio, lighting, and network recommendations with optional [Cisco guidance](url) markdown — no raw URLs. Return focusRegions boxes (0–1, top-left of the PRIMARY photo) for the TV/monitor, camera/webcam, chair, lights/window, and desk/network cluster when those objects are visible in the first image.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const vision = await runVisionJsonWithFallback({
      system,
      userText,
      images: visionImages,
    });
    const assistantOut = vision.text;
    const successModelId = vision.model;
    const successProvider = vision.provider;

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

    const parsedKnownCeiling = parseKnownCeilingHeight(knownCeilingHeight, unit);
    const coerced = coerceRoomAnalysisPayload(
      parsedJson,
      parsedKnownCeiling !== undefined
        ? { knownCeilingHeight: parsedKnownCeiling, unit }
        : undefined,
    );
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
          provider: successProvider,
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
