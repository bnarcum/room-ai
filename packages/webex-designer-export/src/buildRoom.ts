import type {
  BuildWebexDesignerRoomOptions,
  RoomAnalysisForWebex,
  WebexDesignerRoomJson,
} from "./types";

const FT_TO_M = 0.3048;
const TABLE_HEIGHT_M = 0.71;
const TABLE_CENTER_Y = TABLE_HEIGHT_M / 2;
/** Typical spacing from table edge to chair (~arm reach + gap) */
const CHAIR_RING_PAD_M = 0.52;
const MAX_SEATS = 24;
const MIN_SEATS = 4;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function toMeters(value: number, unit: "feet" | "meters"): number {
  return unit === "feet" ? value * FT_TO_M : value;
}

function slugTitle(likelyUse: string): string {
  const t = likelyUse.replace(/[/\\?%*:|"<>]/g, "-").trim() || "unknown";
  return `Room Vision — ${t}`;
}

/**
 * Rough heuristic for boardroom seating when the vision model under-counts people
 * (floor area ≈ m² per seat for conference layouts).
 */
function heuristicSeatCount(widthM: number, lengthM: number): number {
  const area = Math.max(widthM * lengthM, 1);
  const n = Math.round(area / 3.25);
  return Math.min(MAX_SEATS, Math.max(MIN_SEATS, n));
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

/** Screen diagonal inches — scale up slightly for large rooms */
function screenSizeInches(widthM: number, lengthM: number): number {
  const span = Math.max(widthM, lengthM);
  if (span >= 8.5) return 85;
  if (span >= 7) return 75;
  return 65;
}

/**
 * Seat positions around a rectangle (chair ring outside table half-extents).
 * Half-extents are in room space (x, z): table centered at origin in x, at tableCenterZ in z,
 * before table rotation — we apply rotation to seat offsets when rotateTableY ≠ 0.
 */
function perimeterChairPositions(params: {
  seatCount: number;
  /** Table half-width (short side of physical table), meters */
  halfShort: number;
  /** Table half-length (long side), meters */
  halfLong: number;
  tableCenterZ: number;
  rotateTableY: number;
}): { cx: number; cz: number; yaw: number }[] {
  const {
    seatCount,
    halfShort,
    halfLong,
    tableCenterZ,
    rotateTableY,
  } = params;

  const hw = halfShort + CHAIR_RING_PAD_M;
  const hl = halfLong + CHAIR_RING_PAD_M;

  /** Bottom / top run along x at z = ±hl; left / right run along z at x = ±hw */
  const edgeBottom = 2 * hw;
  const edgeRight = 2 * hl;
  const edgeTop = 2 * hw;
  const edgeLeft = 2 * hl;
  const perimeter = edgeBottom + edgeRight + edgeTop + edgeLeft;

  const chairs: { cx: number; cz: number; yaw: number }[] = [];
  const n = Math.max(seatCount, MIN_SEATS);

  for (let i = 0; i < n; i++) {
    const s = ((i + 0.5) / n) * perimeter;

    let lx: number;
    let lz: number;

    if (s < edgeBottom) {
      /** Bottom edge (-hl): x from -hw → +hw */
      const t = s / edgeBottom;
      lx = -hw + t * (2 * hw);
      lz = -hl;
    } else if (s < edgeBottom + edgeRight) {
      /** Right edge (+hw): z from -hl → +hl */
      const u = (s - edgeBottom) / edgeRight;
      lx = hw;
      lz = -hl + u * (2 * hl);
    } else if (s < edgeBottom + edgeRight + edgeTop) {
      /** Top (+hl): x from +hw → -hw */
      const u = (s - edgeBottom - edgeRight) / edgeTop;
      lx = hw - u * (2 * hw);
      lz = hl;
    } else {
      /** Left (-hw): z from +hl → -hl */
      const u = (s - edgeBottom - edgeRight - edgeTop) / edgeLeft;
      lx = -hw;
      lz = hl - u * (2 * hl);
    }

    /** Rotate table-local (x,z) into room space (right-hand, +y up) */
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

    /** Face table center (0, tableCenterZ) */
    const yaw = round3(Math.atan2(-cx, -(cz - tableCenterZ)));

    chairs.push({ cx, cz, yaw });
  }

  return chairs;
}

/**
 * Builds JSON for Cisco Webex **Workspace Designer** custom rooms (drag-and-drop on the 3D view).
 * Units are **meters** and rotations **radians** per Cisco documentation.
 *
 * Layout targets **large conference / boardroom** photos: elongated table, chairs around the
 * perimeter (not a circle), seat count from max(occupancy, floor-area heuristic).
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

  const { tableWid, tableLen, rotateTableY, tableCenterZ } = tableDimensions(wm, lm);

  /** Long / short half-extents in table local space (length = long axis of table object) */
  const halfLong = tableLen / 2;
  const halfShort = tableWid / 2;

  const wallInset = 0.15;
  const wallX = round3(-wm / 2 + wallInset);

  const heuristic = heuristicSeatCount(wm, lm);
  const occ = analysis.roomSummary.occupancy;
  const occN = Number.isFinite(occ) && occ > 0 ? Math.floor(occ) : 0;
  /** Prefer model count, but scale up when the room clearly fits more people */
  const seatCount = Math.min(
    MAX_SEATS,
    Math.max(MIN_SEATS, Math.max(occN, heuristic))
  );

  const screenInch = screenSizeInches(wm, lm);

  const customObjects: Record<string, unknown>[] = [];

  customObjects.push({
    id: "rai-table",
    objectType: "table",
    model: "regular",
    width: tableWid,
    length: tableLen,
    position: [0, TABLE_CENTER_Y, tableCenterZ],
    rotation: [0, rotateTableY, 0],
  });

  customObjects.push({
    id: "rai-roombar",
    objectType: "videoDevice",
    model: "Room Bar Pro",
    color: "dark",
    position: [wallX, 1.75, tableCenterZ],
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

  customObjects.push({
    id: "rai-table-mic",
    objectType: "microphone",
    model: "Table Mic Pro",
    position: [0, 0.7, tableCenterZ],
  });

  const chairPos = perimeterChairPositions({
    seatCount,
    halfShort,
    halfLong,
    tableCenterZ,
    rotateTableY,
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
  const base = title.replace(/[/\\?%*:|"<>]/g, "-").trim() || "Room-Vision";
  return `${base}.webex-room.json`;
}
