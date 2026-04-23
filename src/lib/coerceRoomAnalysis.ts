const PAD_REC =
  "Review this area using what is visible in the photo and adjust for your layout.";
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

/** Like stringArray but allows truly empty lists (no pad) for optional inventories. */
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

  base.dimensions = {
    unit: unitOf(dims.unit),
    length: num(dims.length, 14),
    width: num(dims.width, 12),
    height: num(dims.height, 9),
    confidence: Math.min(1, Math.max(0, num(dims.confidence, 0.45))),
    reasoning: str(
      dims.reasoning,
      "Rough estimate from a single perspective; limited visibility of full room geometry.",
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

  const rsIn = base.roomSummary;
  const rs =
    rsIn && typeof rsIn === "object"
      ? (rsIn as Record<string, unknown>)
      : {};
  base.roomSummary = {
    likelyUse: str(rs.likelyUse, "unknown"),
    occupancy: Math.max(0, Math.round(num(rs.occupancy, 0))),
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
    recommendations[k] = stringArray(rec[k], PAD_REC);
  }
  base.recommendations = recommendations;

  let qc = base.quickChecklist;
  const checklist = stringArray(qc, PAD_CHECK);
  while (checklist.length < 3) checklist.push(PAD_CHECK);
  base.quickChecklist = checklist;

  return base;
}
