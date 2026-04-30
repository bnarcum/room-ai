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

/** Repair common model quirks before Zod validation. */
export function coerceQuickEstimatePayload(raw: unknown): unknown {
  const base =
    raw && typeof raw === "object"
      ? (JSON.parse(JSON.stringify(raw)) as Record<string, unknown>)
      : {};

  return {
    seatCount: num(base.seatCount, 8),
    screenCount: num(base.screenCount, 1),
    primaryScreenDiagonalInches: num(base.primaryScreenDiagonalInches, 65),
    notes: str(base.notes, ""),
  };
}
