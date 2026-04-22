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

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

function pickVisionModel() {
  // Priority order: Claude (Anthropic) -> Gemini (Google) -> OpenAI
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    return {
      provider: "anthropic" as const,
      model: anthropic(process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest"),
    };
  }

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      provider: "google" as const,
      model: google(process.env.GOOGLE_MODEL ?? "gemini-2.5-flash"),
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai" as const,
      model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
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
  if (!(photo instanceof File)) {
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

  try {
    const { output } = await generateText({
      model: chosen.model,
      system,
      output: Output.object({
        schema: roomAnalysisSchema,
        name: "RoomAnalysis",
        description:
          "Estimated room dimensions and collaboration-room improvement recommendations.",
      }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image", image: dataUrl, mediaType },
          ],
        },
      ],
    });

    // extra runtime validation (defensive in case provider returns partial)
    const parsed = roomAnalysisSchema.safeParse(output);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Model returned invalid structured output." },
        { status: 502 }
      );
    }

    const data: RoomAnalysis = parsed.data;
    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during analysis.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

