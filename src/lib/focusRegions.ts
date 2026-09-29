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

const HOME_FALLBACKS: Record<FocusRegionKey, FocusBox> = {
  display: { x: 0.02, y: 0.08, w: 0.48, h: 0.55 },
  camera: { x: 0.55, y: 0.12, w: 0.4, h: 0.45 },
  acoustics: { x: 0.35, y: 0.25, w: 0.35, h: 0.6 },
  lighting: { x: 0.55, y: 0, w: 0.45, h: 0.28 },
  network: { x: 0.62, y: 0.35, w: 0.32, h: 0.4 },
};

/** Conference / classroom: display wall, table, ceiling, AV cluster. */
const CONFERENCE_FALLBACKS: Record<FocusRegionKey, FocusBox> = {
  display: { x: 0.3, y: 0.04, w: 0.4, h: 0.36 },
  camera: { x: 0.38, y: 0.06, w: 0.24, h: 0.2 },
  acoustics: { x: 0.22, y: 0.4, w: 0.56, h: 0.42 },
  lighting: { x: 0.1, y: 0, w: 0.8, h: 0.26 },
  network: { x: 0.34, y: 0.5, w: 0.32, h: 0.28 },
};

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
  return { x, y, w, h };
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

export function isPersonalFocusLayout(likelyUse: string): boolean {
  return likelyUse === "home" || likelyUse === "small-office";
}

export function fallbackFocusRegions(
  likelyUse: string,
  occupancy = 0,
): Record<FocusRegionKey, FocusBox> {
  if (isPersonalFocusLayout(likelyUse)) return HOME_FALLBACKS;
  if (likelyUse === "unknown" && occupancy >= 1 && occupancy <= 2) {
    return HOME_FALLBACKS;
  }
  return CONFERENCE_FALLBACKS;
}

export function resolveFocusRegion(
  key: FocusRegionKey,
  focusRegions: FocusRegions | undefined,
  likelyUse: string,
  occupancy = 0,
): FocusBox {
  return focusRegions?.[key] ?? fallbackFocusRegions(likelyUse, occupancy)[key];
}
