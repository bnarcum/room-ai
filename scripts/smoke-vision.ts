/**
 * End-to-end check: Anthropic Messages API (base64 image) + JSON parse + Zod.
 * Run:  ANTHROPIC_API_KEY=sk-ant-... pnpm smoke:vision
 * Or:   pnpm smoke:vision  (reads .env.local if present via Node 20+ --env-file in package override)
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { anthropicCredentialFromEnv, anthropicVisionMessages } from "../src/lib/anthropicMessages";
import { prepareImageForVision } from "../src/lib/imageMime";
import { extractBalancedJsonObject } from "../src/lib/extractModelJson";
import { coerceRoomAnalysisPayload } from "../src/lib/coerceRoomAnalysis";
import { roomAnalysisSchema } from "../src/lib/roomAnalysis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// 1×1 transparent PNG
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function loadEnvLocal() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return;
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m || line.startsWith("#")) continue;
    const k = m[1];
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();

  const cred = anthropicCredentialFromEnv();
  if (!cred) {
    console.error("FAIL: No ANTHROPIC_API_KEY (or ANTHROPIC_KEY / CLAUDE_API_KEY).");
    process.exit(1);
  }

  const argvPath = process.argv[2];
  let buf: Buffer;
  let declaredType = "image/png";
  if (argvPath && existsSync(argvPath)) {
    buf = readFileSync(argvPath);
    if (argvPath.toLowerCase().endsWith(".jpg") || argvPath.toLowerCase().endsWith(".jpeg"))
      declaredType = "image/jpeg";
  } else {
    buf = Buffer.from(TINY_PNG_B64, "base64");
  }

  const prepared = prepareImageForVision(buf, declaredType);
  const jsonShape =
    'Reply with ONLY valid JSON matching: dimensions(unit feet|meters,length,width,height,confidence,reasoning), detectedReference(type,notes), roomSummary(likelyUse,occupancy,keyConstraints[]), recommendations(camera[],lighting[],...), quickChecklist[]';

  const system = [
    "You are testing JSON output.",
    jsonShape,
    "The image may be a 1-pixel test image — still return plausible numbers.",
  ].join("\n");

  const userText =
    "Return the JSON object now. Preferred unit feet. Reference none.";

  console.log("Calling Anthropic Messages API (native fetch) …");
  const rawText = await anthropicVisionMessages({
    credential: cred,
    model: process.env.SMOKE_MODEL ?? "claude-haiku-4-5-20251001",
    system,
    userText,
    mediaType: prepared.mediaType,
    imageBase64: prepared.buffer.toString("base64"),
    maxTokens: 8192,
    temperature: 0.2,
  });

  if (!rawText.trim()) {
    console.error("FAIL: Empty assistant text.");
    process.exit(1);
  }

  console.log("Assistant text length:", rawText.length);

  let json: unknown;
  try {
    json = extractBalancedJsonObject(rawText);
  } catch (e) {
    console.error("FAIL: JSON extract:", e);
    console.error("First 500 chars:", rawText.slice(0, 500));
    process.exit(1);
  }

  const coerced = coerceRoomAnalysisPayload(json);
  const parsed = roomAnalysisSchema.safeParse(coerced);
  if (!parsed.success) {
    console.error("FAIL: Zod:", parsed.error.flatten());
    process.exit(1);
  }

  console.log("OK — vision + JSON + schema validated.");
  console.log("likelyUse:", parsed.data.roomSummary.likelyUse);
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
