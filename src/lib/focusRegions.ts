export type FocusBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type FocusRegionKey =
  | "camera"
  | "display"
  | "acoustics"
  | "lighting"
  | "network";

export type FocusRegions = Partial<Record<FocusRegionKey, FocusBox>>;

export const FOCUS_REGION_KEYS = [
  "camera",
  "display",
  "acoustics",
  "lighting",
  "network",
] as const satisfies readonly FocusRegionKey[];

/** Drop boxes that cover most of the frame — those are guesses, not objects. */
export function isUsableFocusBox(box: FocusBox): boolean {
  const area = box.w * box.h;
  if (area > 0.42) return false;
  if (box.w > 0.82 && box.h > 0.38) return false;
  if (box.h > 0.82 && box.w > 0.38) return false;
  return true;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Accept 0–1, or 0–100 percentages from sloppy model output. */
function unitInterval(n: number): number {
  const scaled = n > 1 && n <= 100 ? n / 100 : n;
  return Math.min(1, Math.max(0, scaled));
}

export function clampFocusBox(raw: unknown): FocusBox | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const x0 = num(o.x);
  const y0 = num(o.y);
  const w0 = num(o.w);
  const h0 = num(o.h);
  if (x0 === null || y0 === null || w0 === null || h0 === null) return undefined;
  if (!(w0 > 0) || !(h0 > 0)) return undefined;

  const x = unitInterval(x0);
  const y = unitInterval(y0);
  const w = Math.min(unitInterval(w0), 1 - x);
  const h = Math.min(unitInterval(h0), 1 - y);
  if (w < 0.02 || h < 0.02) return undefined;
  const box = { x, y, w, h };
  return isUsableFocusBox(box) ? box : undefined;
}

export function coerceFocusRegions(raw: unknown): FocusRegions | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: FocusRegions = {};
  for (const key of FOCUS_REGION_KEYS) {
    const box = clampFocusBox(o[key]);
    if (box) out[key] = box;
  }
  return Object.keys(out).length ? out : undefined;
}

export function resolveFocusRegion(
  key: FocusRegionKey,
  focusRegions: FocusRegions | undefined,
): FocusBox | null {
  const box = focusRegions?.[key];
  return box && isUsableFocusBox(box) ? box : null;
}
