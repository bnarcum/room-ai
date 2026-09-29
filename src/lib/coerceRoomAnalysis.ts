import { isPersonalWorkspace } from "webex-designer-export";

import { coerceFocusRegions } from "./focusRegions";
import { resolveLikelyUse } from "./roomAnalysis";
import {
  capPersonalWorkspaceHeight,
  midpointFromRange,
  rangeFromMidpoint,
} from "./roomSizing";
import { RECOMMENDATION_CATEGORY_FALLBACKS } from "./webexDesignerResources";

const PAD_CHECK = "Confirm network drops, power, and cable paths for your gear.";
const PAD_CONSTRAINT =
  "Single-photo view limits precision; verify measurements on site.";

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.trim());
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function str(v: unknown, fallback: string): string {
  if (typeof v === "string") return v.trim() || fallback;
  if (v === null || v === undefined) return fallback;
  return String(v).trim() || fallback;
}

function unitOf(v: unknown): "feet" | "meters" {
  if (typeof v !== "string") return "feet";
  const u = v.toLowerCase().trim();
  if (u === "meters" || u === "meter" || u === "m") return "meters";
  return "feet";
}

function stringArray(v: unknown, pad: string): string[] {
  if (!Array.isArray(v)) {
    return typeof v === "string" && v.trim() ? [v.trim()] : [pad];
  }
  const out = v
    .map((x) => (typeof x === "string" ? x.trim() : String(x)))
    .filter((s) => s.length > 0);
  return out.length ? out : [pad];
}

/** Parsed model strings only — empty means “use category fallbacks”, not a generic pad. */
function nonEmptyRecommendationStrings(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return typeof v === "string" && v.trim() ? [v.trim()] : [];
  }
  return v
    .map((x) => (typeof x === "string" ? x.trim() : String(x)))
    .filter((s) => s.length > 0);
}

/** Like stringArray but allows truly empty lists (no pad) for optional inventories. */
function axisWithRange(
  midRaw: unknown,
  minRaw: unknown,
  maxRaw: unknown,
  fallbackMid: number,
  confidence: number,
): { mid: number; min: number; max: number } {
  let mid = num(midRaw, Number.NaN);
  let min = num(minRaw, Number.NaN);
  let max = num(maxRaw, Number.NaN);
  if (!Number.isFinite(mid)) {
    mid =
      Number.isFinite(min) && Number.isFinite(max)
        ? midpointFromRange(min, max)
        : fallbackMid;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    const synthesized = rangeFromMidpoint(mid, confidence);
    min = synthesized.min;
    max = synthesized.max;
  }
  if (mid < min || mid > max) {
    mid = midpointFromRange(min, max);
  }
  return { mid, min, max };
}

function stringArrayOptional(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return typeof v === "string" && v.trim() ? [v.trim()] : [];
  }
  return v
    .map((x) => (typeof x === "string" ? x.trim() : String(x)))
    .filter((s) => s.length > 0);
}

/**
 * Repair common model quirks (numeric strings, empty arrays, missing keys) before Zod.
 */
export function coerceRoomAnalysisPayload(raw: unknown): unknown {
  const base =
    raw && typeof raw === "object"
      ? (JSON.parse(JSON.stringify(raw)) as Record<string, unknown>)
      : {};

  const dimsIn = base.dimensions;
  const dims =
    dimsIn && typeof dimsIn === "object"
      ? (dimsIn as Record<string, unknown>)
      : {};

  const confidence = Math.min(1, Math.max(0, num(dims.confidence, 0.45)));
  const unit = unitOf(dims.unit);
  const length = axisWithRange(dims.length, dims.lengthMin, dims.lengthMax, 14, confidence);
  const width = axisWithRange(dims.width, dims.widthMin, dims.widthMax, 12, confidence);
  let height = axisWithRange(dims.height, dims.heightMin, dims.heightMax, 9, confidence);

  const rsIn = base.roomSummary;
  const rsPeek =
    rsIn && typeof rsIn === "object" ? (rsIn as Record<string, unknown>) : {};
  const occupancyPeek = Math.max(0, Math.round(num(rsPeek.occupancy, 0)));
  const likelyUsePeek = resolveLikelyUse(str(rsPeek.likelyUse, "unknown"), occupancyPeek);
  if (isPersonalWorkspace(likelyUsePeek)) {
    height = capPersonalWorkspaceHeight(unit, height.mid, height.min, height.max);
  }

  base.dimensions = {
    unit,
    length: length.mid,
    width: width.mid,
    height: height.mid,
    lengthMin: length.min,
    lengthMax: length.max,
    widthMin: width.min,
    widthMax: width.max,
    heightMin: height.min,
    heightMax: height.max,
    confidence,
    reasoning: str(
      dims.reasoning,
      "Directional range from a single photo; scaled from door, table, chair, or ceiling cues when visible.",
    ),
  };

  const refIn = base.detectedReference;
  const ref =
    refIn && typeof refIn === "object"
      ? (refIn as Record<string, unknown>)
      : {};
  base.detectedReference = {
    type: str(ref.type, "none"),
    notes: str(
      ref.notes,
      "Interpreted reference settings from the request context.",
    ),
  };

  const rs =
    rsIn && typeof rsIn === "object"
      ? (rsIn as Record<string, unknown>)
      : {};
  const span = Math.max(length.mid, width.mid);
  const inferredScreen =
    span >= 28 ? 85 : span >= 22 ? 75 : span >= 16 ? 65 : span >= 12 ? 55 : 43;
  const occupancy = Math.max(0, Math.round(num(rs.occupancy, 0)));

  base.roomSummary = {
    likelyUse: resolveLikelyUse(str(rs.likelyUse, "unknown"), occupancy),
    occupancy,
    primaryScreenDiagonalInches: Math.max(
      32,
      Math.min(120, Math.round(num(rs.primaryScreenDiagonalInches, inferredScreen))),
    ),
    screenCount: Math.max(0, Math.min(8, Math.round(num(rs.screenCount, 0)))),
    keyConstraints: stringArray(rs.keyConstraints, PAD_CONSTRAINT),
  };

  const obsIn = base.observedItems;
  const obs =
    obsIn && typeof obsIn === "object"
      ? (obsIn as Record<string, unknown>)
      : {};
  base.observedItems = {
    electronicsAndDevices: stringArrayOptional(obs.electronicsAndDevices),
    plantsAndDecor: stringArrayOptional(obs.plantsAndDecor),
    otherNotable: stringArrayOptional(obs.otherNotable),
  };

  const recIn = base.recommendations;
  const rec =
    recIn && typeof recIn === "object"
      ? (recIn as Record<string, unknown>)
      : {};
  const keys = [
    "camera",
    "lighting",
    "acoustics",
    "display",
    "seating",
    "cabling",
    "network",
    "power",
  ] as const;
  const recommendations: Record<string, string[]> = {};
  for (const k of keys) {
    const parsed = nonEmptyRecommendationStrings(rec[k]);
    recommendations[k] =
      parsed.length > 0
        ? parsed
        : [...RECOMMENDATION_CATEGORY_FALLBACKS[k]];
  }
  base.recommendations = recommendations;

  let qc = base.quickChecklist;
  const checklist = stringArray(qc, PAD_CHECK);
  while (checklist.length < 3) checklist.push(PAD_CHECK);
  base.quickChecklist = checklist;

  const regions = coerceFocusRegions(base.focusRegions);
  if (regions) base.focusRegions = regions;
  else delete base.focusRegions;

  return base;
}
