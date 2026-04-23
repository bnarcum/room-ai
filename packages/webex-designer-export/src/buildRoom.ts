import type {
  BuildWebexDesignerRoomOptions,
  RoomAnalysisForWebex,
  WebexDesignerRoomJson,
} from "./types";

const FT_TO_M = 0.3048;
const TABLE_HEIGHT_M = 0.71;
const TABLE_CENTER_Y = TABLE_HEIGHT_M / 2;

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
 * Builds JSON for Cisco Webex **Workspace Designer** custom rooms (drag-and-drop on the 3D view).
 * Units are **meters** and rotations **radians** per Cisco documentation.
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

  /** Table size — proportion of room, clamped for stability */
  const tableLen = round3(Math.min(Math.max(lm * 0.48, 1.2), lm * 0.82));
  const tableWid = round3(Math.min(Math.max(wm * 0.42, 1.0), wm * 0.72));

  /** Table slightly toward +z from center (into the room from the video wall at −x) */
  const tableZ = round3(lm * 0.12);
  const wallInset = 0.15;
  const wallX = round3(-wm / 2 + wallInset);

  const customObjects: Record<string, unknown>[] = [];

  customObjects.push({
    id: "rai-table",
    objectType: "table",
    model: "regular",
    width: tableWid,
    length: tableLen,
    position: [0, TABLE_CENTER_Y, tableZ],
    rotation: [0, 0, 0],
  });

  customObjects.push({
    id: "rai-roombar",
    objectType: "videoDevice",
    model: "Room Bar Pro",
    color: "dark",
    position: [wallX, 1.75, tableZ],
    rotation: [0, 1.57, 0],
  });

  customObjects.push({
    id: "rai-screen",
    objectType: "screen",
    position: [wallX, 1.22, tableZ],
    rotation: [0, 1.57, 0],
    scale: [1, 1, 1],
    size: 75,
    role: "singleScreen",
  });

  customObjects.push({
    id: "rai-table-mic",
    objectType: "microphone",
    model: "Table Mic Pro",
    position: [0, 0.7, tableZ],
  });

  const occ = analysis.roomSummary.occupancy;
  const seatCount = Math.min(Math.max(Number.isFinite(occ) ? occ : 4, 2), 8);
  const radius =
    Math.min(tableLen, tableWid) * 0.45 + 0.42;

  for (let i = 0; i < seatCount; i++) {
    const a = (i / seatCount) * 2 * Math.PI + Math.PI / seatCount;
    const cx = round3(Math.cos(a) * radius);
    const cz = round3(tableZ + Math.sin(a) * radius);
    /** Face approximate table center (0, tableZ) */
    const yaw = round3(Math.atan2(-cx, tableZ - cz));
    customObjects.push({
      id: `rai-chair-${i + 1}`,
      objectType: "chair",
      position: [cx, 0, cz],
      rotation: [0, yaw, 0],
    });
  }

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
