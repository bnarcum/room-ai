import {
  effectiveDesignerSeatCount,
  pickRoomLayoutKind,
  type RoomLayoutKind,
} from "./roomTier";
import type {
  BuildWebexDesignerRoomOptions,
  RoomAnalysisForWebex,
  WebexDesignerRoomJson,
} from "./types";

const FT_TO_M = 0.3048;
/** Typical conference table surface height when the mesh sits on the floor (m). */
const TABLE_HEIGHT_M = 0.71;
/**
 * Workspace Designer `table` objects use a **floor pivot** (bottom-center), same as chairs at y=0.
 * Do not use half-height here — that was causing floating tables when the asset origin is the base.
 */
const TABLE_POSITION_Y = 0;
/** Table Mic Pro sits on the tabletop — slightly above nominal surface height for the puck. */
const TABLE_MIC_Y = TABLE_HEIGHT_M + 0.03;
/** Distance from table apron to chair center (Designer avatars sit better when not overshot). */
const CHAIR_RING_PAD_M = 0.38;
/** Chair centers must stay inside the floor polygon by at least this margin (m). */
const WALL_CLEARANCE_M = 0.42;
const MAX_SEATS = 24;
const MIN_SEATS = 2;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function toMeters(value: number, unit: "feet" | "meters"): number {
  return unit === "feet" ? value * FT_TO_M : value;
}

function titleFromLikelyUse(likelyUse: string): string {
  const raw = likelyUse.replace(/[/\\?%*:|"<>]/g, "-").trim().toLowerCase();
  switch (raw) {
    case "home":
    case "small-office":
    case "home-office":
      return "Home Office";
    case "conference":
      return "Conference";
    case "classroom":
      return "Classroom";
    default:
      return "Meeting Room";
  }
}

function slugTitle(likelyUse: string): string {
  return `SnapRoom — ${titleFromLikelyUse(likelyUse)}`;
}

/** Long conference table: long axis follows the longer room dimension. */
function tableDimensions(widthM: number, lengthM: number): {
  tableWid: number;
  tableLen: number;
  /** Rotate table 90° (yaw π/2) so local length aligns with room x */
  rotateTableY: number;
  tableCenterZ: number;
} {
  const wm = Math.max(widthM, 2.5);
  const lm = Math.max(lengthM, 2.5);
  const roomLong = Math.max(wm, lm);
  const roomShort = Math.min(wm, lm);

  /** Leave walking margin along each long wall */
  const longEdge = round3(
    Math.min(roomLong * 0.76, roomLong - 1.15)
  );
  const shortEdge = round3(
    Math.min(Math.max(roomShort * 0.38, 1.1), roomShort - 0.85)
  );

  /**
   * Webex `table` object: `length` is the long side, `width` the short side.
   * Default orientation: long side along room +z. If the room is wider in x, rotate 90°
   * so the long side runs along +x.
   */
  const lengthAlongZ = lm >= wm;
  const tableWid = shortEdge;
  const tableLen = longEdge;
  const rotateTableY = lengthAlongZ ? 0 : Math.PI / 2;

  /** Center layout in room (matches typical CAD / Designer imports) */
  const tableCenterZ = 0;

  return {
    tableWid: Math.max(tableWid, 1),
    tableLen: Math.max(tableLen, Math.max(tableWid, 1)),
    rotateTableY,
    tableCenterZ,
  };
}

/**
 * Shrinks table length/width so long-side chair centers stay inside the room for the
 * given table yaw (0 = long axis along room +z, π/2 = long axis along room +x).
 *
 * Long-side seats sit at z = ±(hl+pad) (local) or x = ±(hl+pad) after π/2 rotation;
 * along-edge variation in x is bounded by halfShort. Use conservative inset vs. xInset in
 * {@link longSideChairPositions}.
 */
function clampTableDimensionsForLongSideSeating(params: {
  wm: number;
  lm: number;
  tableWid: number;
  tableLen: number;
  rotateTableY: number;
  pad: number;
}): { tableWid: number; tableLen: number } {
  const { wm, lm, rotateTableY, pad } = params;
  const c = WALL_CLEARANCE_M;
  /** Slightly smaller than max xInset so clamp stays valid for chair rows */
  const edgeInset = 0.14;
  const alignRoomZ = Math.abs(rotateTableY) < 0.01;

  let hs = params.tableWid / 2;
  let hl = params.tableLen / 2;

  if (alignRoomZ) {
    const maxHs = wm / 2 - c - edgeInset;
    const maxHl = lm / 2 - c - pad;
    hs = Math.min(hs, maxHs);
    hl = Math.min(hl, maxHl);
  } else {
    const maxHl = wm / 2 - c - pad;
    const maxHs = lm / 2 - c - edgeInset;
    hl = Math.min(hl, maxHl);
    hs = Math.min(hs, maxHs);
  }

  /** Table asset: length (long axis) ≥ width */
  if (hl < hs) {
    hs = hl;
  }

  let tableWid = round3(2 * Math.max(0.4, hs));
  let tableLen = round3(2 * Math.max(0.4, hl));
  if (tableLen < tableWid) {
    tableLen = tableWid;
  }

  return {
    tableWid: Math.max(tableWid, 1),
    tableLen: Math.max(tableLen, Math.max(tableWid, 1)),
  };
}

function minSeatsForLayout(kind: RoomLayoutKind): number {
  if (kind === "huddle") return 2;
  if (kind === "small") return 4;
  return 4;
}

function defaultScreenForLayout(
  kind: RoomLayoutKind,
  widthM: number,
  lengthM: number,
): number {
  const span = Math.max(widthM, lengthM);
  switch (kind) {
    case "huddle":
      return span >= 4.2 ? 50 : 43;
    case "small":
      return span >= 5.5 ? 65 : 55;
    case "medium":
      return span >= 7 ? 75 : 65;
    case "large":
      return span >= 8.5 ? 85 : 75;
    case "boardroom":
      return span >= 8.5 ? 85 : 75;
  }
}

function resolveScreenInches(
  analysis: RoomAnalysisForWebex,
  kind: RoomLayoutKind,
  widthM: number,
  lengthM: number,
): number {
  const raw = analysis.roomSummary.primaryScreenDiagonalInches;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 32 && raw <= 120) {
    return Math.round(raw);
  }
  return defaultScreenForLayout(kind, widthM, lengthM);
}

function videoDeviceModel(kind: RoomLayoutKind): "Room Bar" | "Room Bar Pro" {
  return kind === "huddle" || kind === "small" ? "Room Bar" : "Room Bar Pro";
}

function includeTableMic(kind: RoomLayoutKind): boolean {
  return kind === "medium" || kind === "large" || kind === "boardroom";
}

function tableDimensionsForLayout(
  kind: RoomLayoutKind,
  widthM: number,
  lengthM: number,
): ReturnType<typeof tableDimensions> {
  if (kind === "huddle") {
    const short = Math.min(widthM, lengthM);
    const side = round3(Math.min(1.35, Math.max(0.9, short * 0.4)));
    return {
      tableWid: side,
      tableLen: round3(Math.max(side * 1.15, 1.1)),
      rotateTableY: 0,
      tableCenterZ: 0,
    };
  }
  const base = tableDimensions(widthM, lengthM);
  if (kind === "small") {
    return {
      ...base,
      tableWid: round3(Math.max(1, base.tableWid * 0.88)),
      tableLen: round3(Math.max(base.tableWid, base.tableLen * 0.82)),
    };
  }
  return base;
}

/**
 * Boardroom-style seating: chairs only on the two **long** sides of the table (not on the
 * short / head ends). That keeps seats away from narrow walls, avoids corner clipping, and
 * pulls every chair up to the table edge instead of leaving one “stray” seat on an end wall.
 */
function longSideChairPositions(params: {
  seatCount: number;
  halfShort: number;
  halfLong: number;
  tableCenterZ: number;
  rotateTableY: number;
  pad: number;
}): { cx: number; cz: number; yaw: number }[] {
  const {
    seatCount,
    halfShort,
    halfLong,
    tableCenterZ,
    rotateTableY,
    pad,
  } = params;

  const n = Math.max(seatCount, MIN_SEATS);
  const bottomCount = Math.floor(n / 2);
  const topCount = n - bottomCount;

  /** Long sides in table-local space: z = ±(halfLong + pad), x along table width */
  const zEdge = halfLong + pad;
  const zBottom = -zEdge;
  const zTop = zEdge;

  /** Slight inset so seats are not exactly on the short-axis corners */
  const xInset = Math.min(0.18, Math.max(0.06, halfShort * 0.08));
  const xMin = -halfShort + xInset;
  const xMax = halfShort - xInset;

  const chairs: { cx: number; cz: number; yaw: number }[] = [];

  function pushRow(count: number, lz: number) {
    if (count <= 0) return;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const lx = xMin + t * (xMax - xMin);
      let rx = lx;
      let rz = lz;
      if (Math.abs(rotateTableY) > 0.01) {
        const c = Math.cos(rotateTableY);
        const s = Math.sin(rotateTableY);
        rx = lx * c + lz * s;
        rz = -lx * s + lz * c;
      }
      const cx = round3(rx);
      const cz = round3(rz + tableCenterZ);
      const yaw = round3(Math.atan2(-cx, -(cz - tableCenterZ)));
      chairs.push({ cx, cz, yaw });
    }
  }

  pushRow(bottomCount, zBottom);
  pushRow(topCount, zTop);

  return chairs;
}

/**
 * Builds JSON for Cisco Webex **Workspace Designer** custom rooms (drag-and-drop on the 3D view).
 * Units are **meters** and rotations **radians** per Cisco documentation.
 *
 * Layout follows room type (huddle / small / medium / large / boardroom) from seat count —
 * not a one-size boardroom with Room Bar Pro + Table Mic.
 */
export function buildWebexDesignerRoomJson(
  analysis: RoomAnalysisForWebex,
  options?: BuildWebexDesignerRoomOptions
): WebexDesignerRoomJson {
  const d = analysis.dimensions;
  const unit = d.unit;

  const widthM = round3(toMeters(d.width, unit));
  const lengthM = round3(toMeters(d.length, unit));
  const heightM = round3(toMeters(d.height, unit));

  const wm = Math.max(widthM, 2.5);
  const lm = Math.max(lengthM, 2.5);
  const hm = Math.max(heightM, 2.3);

  const title = options?.title?.trim() || slugTitle(analysis.roomSummary.likelyUse);

  const rawSeats = effectiveDesignerSeatCount({
    occupancy: analysis.roomSummary.occupancy,
    width: d.width,
    length: d.length,
    unit,
    likelyUse: analysis.roomSummary.likelyUse,
  });
  const layoutKind = pickRoomLayoutKind(rawSeats);
  const minSeats = minSeatsForLayout(layoutKind);
  const seatCount = Math.min(MAX_SEATS, Math.max(minSeats, rawSeats));

  let { tableWid, tableLen, rotateTableY, tableCenterZ } =
    tableDimensionsForLayout(layoutKind, wm, lm);
  const clamped = clampTableDimensionsForLongSideSeating({
    wm,
    lm,
    tableWid,
    tableLen,
    rotateTableY,
    pad: CHAIR_RING_PAD_M,
  });
  tableWid = clamped.tableWid;
  tableLen = clamped.tableLen;

  const halfLong = tableLen / 2;
  const halfShort = tableWid / 2;

  const wallInset = 0.15;
  const wallX = round3(-wm / 2 + wallInset);
  const screenInch = resolveScreenInches(analysis, layoutKind, wm, lm);

  const customObjects: Record<string, unknown>[] = [];

  customObjects.push({
    id: "rai-table",
    objectType: "table",
    model: "regular",
    width: tableWid,
    length: tableLen,
    position: [0, TABLE_POSITION_Y, tableCenterZ],
    rotation: [0, rotateTableY, 0],
  });

  customObjects.push({
    id: "rai-roombar",
    objectType: "videoDevice",
    model: videoDeviceModel(layoutKind),
    color: "dark",
    position: [wallX, layoutKind === "huddle" ? 1.55 : 1.75, tableCenterZ],
    rotation: [0, 1.57, 0],
  });

  customObjects.push({
    id: "rai-screen",
    objectType: "screen",
    position: [wallX, 1.22, tableCenterZ],
    rotation: [0, 1.57, 0],
    scale: [1, 1, 1],
    size: screenInch,
    role: "singleScreen",
  });

  if (includeTableMic(layoutKind)) {
    customObjects.push({
      id: "rai-table-mic",
      objectType: "microphone",
      model: "Table Mic Pro",
      position: [0, round3(TABLE_MIC_Y), tableCenterZ],
    });
  }

  const chairPos = longSideChairPositions({
    seatCount,
    halfShort,
    halfLong,
    tableCenterZ,
    rotateTableY,
    pad: CHAIR_RING_PAD_M,
  });

  chairPos.forEach((p, i) => {
    customObjects.push({
      id: `rai-chair-${i + 1}`,
      objectType: "chair",
      position: [p.cx, 0, p.cz],
      rotation: [0, p.yaw, 0],
    });
  });

  return {
    title,
    roomShape: {
      manual: true,
      width: wm,
      length: lm,
      height: hm,
    },
    customObjects,
  };
}

export function webexDesignerJsonFileName(title: string): string {
  const base = title.replace(/[/\\?%*:|"<>]/g, "-").trim() || "SnapRoom";
  return `${base}.webex-room.json`;
}
