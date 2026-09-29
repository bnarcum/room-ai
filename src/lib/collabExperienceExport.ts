import { isPersonalWorkspace } from "webex-designer-export";

import { deriveCollabExportGeometry } from "@/lib/collabExportGeometry";
import { coerceRoomAnalysisPayload } from "@/lib/coerceRoomAnalysis";
import {
  roomAnalysisSchema,
  type RoomAnalysis,
} from "@/lib/roomAnalysis";
import { snapRoomTitle } from "@/lib/roomSizing";

export const COLLAB_EXPERIENCE_URL = "https://collabexperience.com";

/**
 * Video Room Calculator native save format (collabexperience.com / Ctrl+S).
 * Import validates: `room` exists, truthy roomWidth & roomLength, and `roomHeight` key present.
 * @see https://github.com/vtjoeh/video_room_calc/blob/main/FAQ.md
 */
export const VIDEO_ROOM_CALC_FILE_VERSION = "v0.1.671" as const;

/** Embedded analysis payload; preserved as extra keys Video Room Calculator ignores but round-trips on re-save in many builds. */
export const ROOM_AI_VRC_EMBED_VERSION = 1 as const;

export type RoomAiVrcEmbed = {
  embedVersion: typeof ROOM_AI_VRC_EMBED_VERSION;
  generatedAt: string;
  meta?: { provider?: string; model?: string };
  /** Same shape as the room-ai analysis API / full JSON export — all categories + checklist */
  analysis: RoomAnalysis;
};

/** Matches Video Room Calculator HTML defaults / quick setup (see vtjoeh/video_room_calc). */
const FT_PER_M = 3.28084;

export type VrcCanvasItem = {
  x: number;
  y: number;
  id: string;
  data_deviceid: string;
  name?: string;
  width?: number;
  height?: number;
  rotation?: number;
  data_zPosition?: number;
  data_diagonalInches?: number;
  data_layerId?: string;
  data_chairSpacing?: number;
};

export type VideoRoomCalculatorJson = {
  name: string;
  date: string;
  roomId: string;
  version: string;
  unit: "feet" | "meters";
  room: {
    roomWidth: number;
    roomLength: number;
    roomHeight: number | string;
    tableWidth: number;
    tableLength: number;
    distDisplayToTable: number;
    frntWallToTv: number;
    tvDiag: number;
    drpTvNum: number;
    /** Coverage math + UI fields — required for a normal canvas (defaults match RoomCalculator.html). */
    wideFOV?: number;
    teleFOV?: number;
    onePersonCrop?: number;
    twoPersonCrop?: number;
    onePersonZoom?: number;
    twoPersonZoom?: number;
  };
  software: string;
  authorVersion: string;
  /** Current VRC save shape is a flat item list (legacy bucketed files still import). */
  items: VrcCanvasItem[];
  trNodes: unknown[];
  workspace: {
    removeDefaultWalls: boolean;
    addCeiling: boolean;
    theme: string;
  };
  layersVisible: {
    grShadingCamera: boolean;
    grDisplayDistance: boolean;
    grShadingMicrophone: boolean;
    gridLines: boolean;
    grShadingSpeaker: boolean;
    grLabels: boolean;
  };
  roomSurfaces: {
    leftwall: { type: string; acousticTreatment: boolean };
    videowall: { type: string; acousticTreatment: boolean };
    rightwall: { type: string; acousticTreatment: boolean };
    backwall: { type: string; acousticTreatment: boolean };
  };
  /** Optional: room-ai enrichment (not required by Video Room Calculator import). */
  roomAi?: RoomAiVrcEmbed;
};

export type BuildVideoRoomCalculatorOptions = {
  meta?: { provider?: string; model?: string };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Defaults from RoomCalculator.html / quick setup (wide 112°, tele 70°, zoom 5×). */
function defaultRoomCalculationFields(unit: "feet" | "meters"): Pick<
  VideoRoomCalculatorJson["room"],
  | "wideFOV"
  | "teleFOV"
  | "onePersonCrop"
  | "twoPersonCrop"
  | "onePersonZoom"
  | "twoPersonZoom"
> {
  const crops =
    unit === "feet"
      ? {
          onePersonCrop: round2(2.1 * FT_PER_M),
          twoPersonCrop: round2(3.2 * FT_PER_M),
        }
      : {
          onePersonCrop: 2.1,
          twoPersonCrop: 3.2,
        };
  return {
    wideFOV: 112,
    teleFOV: 70,
    onePersonZoom: 5,
    twoPersonZoom: 5,
    ...crops,
  };
}

const LAYER0 = "0";
const CHAIR_SPACING_FT = 2.35;

function fromFeet(valueFt: number, unit: "feet" | "meters"): number {
  return unit === "meters" ? valueFt / FT_PER_M : valueFt;
}

function knownDisplayId(drpTvNum: number): "displaySngl_2" | "displayDbl_2" | "displayTrpl_2" {
  if (drpTvNum === 2) return "displayDbl_2";
  if (drpTvNum >= 3) return "displayTrpl_2";
  return "displaySngl_2";
}

function clampRect(
  x: number,
  y: number,
  width: number,
  height: number,
  roomWidth: number,
  roomLength: number,
): { x: number; y: number; width: number; height: number } {
  let w = Math.max(0.4, Math.min(width, roomWidth - 0.4));
  let h = Math.max(0.4, Math.min(height, roomLength - 0.4));
  let nx = Math.min(Math.max(0.15, x), Math.max(0.15, roomWidth - w - 0.15));
  let ny = Math.min(Math.max(0.15, y), Math.max(0.15, roomLength - h - 0.15));
  if (nx + w > roomWidth - 0.1) w = Math.max(0.4, roomWidth - nx - 0.1);
  if (ny + h > roomLength - 0.1) h = Math.max(0.4, roomLength - ny - 0.1);
  return { x: round2(nx), y: round2(ny), width: round2(w), height: round2(h) };
}

function pushChair(
  items: VrcCanvasItem[],
  x: number,
  y: number,
  rotation: number,
  roomWidth: number,
  roomLength: number,
): void {
  if (x < 0.15 || y < 0.15 || x > roomWidth - 0.15 || y > roomLength - 0.15) {
    return;
  }
  items.push({
    x: round2(x),
    y: round2(y),
    rotation,
    data_deviceid: "chair",
    data_layerId: LAYER0,
    id: crypto.randomUUID(),
    name: "Chair",
  });
}

function buildChairRow(params: {
  unit: "feet" | "meters";
  tableX: number;
  tableY: number;
  tableWidth: number;
  tableLength: number;
  roomWidth: number;
  roomLength: number;
  seatCount: number;
  sittingSideOnly: boolean;
}): VrcCanvasItem[] {
  const {
    unit,
    tableX,
    tableY,
    tableWidth,
    tableLength,
    roomWidth,
    roomLength,
    sittingSideOnly,
  } = params;
  const spacing = fromFeet(CHAIR_SPACING_FT, unit);
  const gap = fromFeet(0.32, unit);
  const displayClearance = fromFeet(1.1, unit);
  const items: VrcCanvasItem[] = [];
  const seatCount = sittingSideOnly
    ? Math.min(2, Math.max(1, params.seatCount))
    : Math.max(2, params.seatCount);

  if (sittingSideOnly) {
    const y = Math.min(
      roomLength - 0.35,
      Math.max(tableY + tableLength + gap, displayClearance),
    );
    if (seatCount === 1) {
      pushChair(
        items,
        tableX + tableWidth / 2,
        y,
        180,
        roomWidth,
        roomLength,
      );
    } else {
      const inset = Math.min(tableWidth * 0.28, fromFeet(0.85, unit));
      pushChair(items, tableX + inset, y, 180, roomWidth, roomLength);
      pushChair(
        items,
        tableX + tableWidth - inset,
        y,
        180,
        roomWidth,
        roomLength,
      );
    }
    return items;
  }

  const perSideLeft = Math.ceil(seatCount / 2);
  const perSideRight = Math.floor(seatCount / 2);
  const usable = Math.max(spacing * 0.5, tableLength - spacing * 0.25);

  function alongY(count: number): number[] {
    if (count <= 0) return [];
    if (count === 1) return [tableY + tableLength / 2];
    const span = Math.min(usable, (count - 1) * spacing);
    const start = tableY + (tableLength - span) / 2;
    return Array.from({ length: count }, (_, i) => start + (span / (count - 1)) * i);
  }

  for (const y of alongY(perSideLeft)) {
    if (y < displayClearance) continue;
    pushChair(
      items,
      tableX - gap,
      y,
      -90,
      roomWidth,
      roomLength,
    );
  }
  for (const y of alongY(perSideRight)) {
    if (y < displayClearance) continue;
    pushChair(
      items,
      tableX + tableWidth + gap,
      y,
      90,
      roomWidth,
      roomLength,
    );
  }

  return items;
}

/**
 * Quick Setup–style canvas: table, display, Room Bar Pro, and a visible chair row.
 * Items are a flat array matching current collabexperience.com saves (v0.1.671).
 */
function buildQuickSetupItems(params: {
  unit: "feet" | "meters";
  roomWidth: number;
  roomLength: number;
  tableWidth: number;
  tableLength: number;
  distDisplayToTable: number;
  frntWallToTv: number;
  tvDiag: number;
  drpTvNum: number;
  seatCount: number;
  sittingSideOnly: boolean;
}): VrcCanvasItem[] {
  const {
    unit,
    roomWidth,
    roomLength,
    distDisplayToTable,
    frntWallToTv,
    tvDiag,
    drpTvNum,
    seatCount,
    sittingSideOnly,
  } = params;

  const tableBox = clampRect(
    roomWidth / 2 - params.tableWidth / 2,
    frntWallToTv + distDisplayToTable,
    params.tableWidth,
    params.tableLength,
    roomWidth,
    roomLength,
  );

  const depthHalfM = 90 / 1000 / 2;
  const offset = unit === "feet" ? depthHalfM * FT_PER_M : depthHalfM;
  const videoY = round2(Math.max(0.15, Math.min(roomLength - 0.15, frntWallToTv - offset)));
  const videoX = round2(Math.max(0.15, Math.min(roomWidth - 0.15, roomWidth / 2)));

  const displayVertM = 1010 / 1000 - 0.23;
  const displayZ =
    unit === "feet" ? round2(displayVertM * FT_PER_M) : round2(displayVertM);

  const displayId = knownDisplayId(drpTvNum);

  const table: VrcCanvasItem = {
    ...tableBox,
    rotation: 0,
    data_deviceid: "tblRect",
    data_layerId: LAYER0,
    id: crypto.randomUUID(),
    name: "Rectangle table",
  };

  const display: VrcCanvasItem = {
    x: videoX,
    y: videoY,
    rotation: 0,
    data_diagonalInches: tvDiag,
    data_zPosition: displayZ,
    data_deviceid: displayId,
    data_layerId: LAYER0,
    id: crypto.randomUUID(),
    name: displayId === "displaySngl_2" ? "Single Display" : "Display",
  };

  // VRC puts the bar on the display by setting its elevation to the top of the glass.
  const toUnit = unit === "feet" ? FT_PER_M : 1;
  const displayHeightM = ((695 * 0.985) / 1000) * (tvDiag / 55);
  const barZ = round2(displayZ + displayHeightM * toUnit);

  const video: VrcCanvasItem = {
    x: videoX,
    y: videoY,
    rotation: 0,
    data_zPosition: barZ,
    data_deviceid: "roomBarPro",
    data_layerId: LAYER0,
    id: crypto.randomUUID(),
    name: "Room Bar Pro",
  };

  const chairs = buildChairRow({
    unit,
    tableX: table.x,
    tableY: table.y,
    tableWidth: table.width ?? tableBox.width,
    tableLength: table.height ?? tableBox.height,
    roomWidth,
    roomLength,
    seatCount,
    sittingSideOnly,
  });

  const items: VrcCanvasItem[] = [table, display, video, ...chairs];
  if (!sittingSideOnly) {
    const tableCenterX = round2(table.x + (table.width ?? tableBox.width) / 2);
    const tableCenterY = round2(table.y + (table.height ?? tableBox.height) / 2);
    const tableTop = round2(0.71 * toUnit);
    items.push({
      x: tableCenterX,
      y: tableCenterY,
      rotation: 0,
      data_zPosition: tableTop,
      data_deviceid: "tableMicPro",
      data_layerId: LAYER0,
      id: crypto.randomUUID(),
      name: "Table Microphone Pro",
    });
    items.push({
      x: round2(tableCenterX + (table.width ?? tableBox.width) / 4),
      y: round2(table.y + (table.height ?? tableBox.height) / 7),
      rotation: 45,
      data_zPosition: tableTop,
      data_deviceid: "navigatorTable",
      data_layerId: LAYER0,
      id: crypto.randomUUID(),
      name: "Table Navigator",
    });
    items.push({
      x: round2(roomWidth + 0.15 * toUnit),
      y: round2(Math.max(0.4, roomLength - 1.5 * toUnit)),
      rotation: 90,
      data_zPosition: round2(1.1 * toUnit),
      data_deviceid: "navigatorWall",
      data_layerId: LAYER0,
      id: crypto.randomUUID(),
      name: "Wall Navigator",
    });
  }

  return items;
}

/**
 * Build a `.vrc.json` document that Video Room Calculator can import
 * (New → Open File, Ctrl+I, or drag onto the canvas).
 * Includes full analysis (all recommendations + checklist) under `roomAi`.
 */
export function buildVideoRoomCalculatorJson(
  analysis: RoomAnalysis,
  options?: BuildVideoRoomCalculatorOptions
): VideoRoomCalculatorJson {
  const d = analysis.dimensions;
  const unit: "feet" | "meters" = d.unit === "meters" ? "meters" : "feet";
  const name = snapRoomTitle(analysis.roomSummary.likelyUse);

  const roomAi: RoomAiVrcEmbed = {
    embedVersion: ROOM_AI_VRC_EMBED_VERSION,
    generatedAt: new Date().toISOString(),
    ...(options?.meta ? { meta: options.meta } : {}),
    analysis: structuredClone(analysis),
  };

  const geo = deriveCollabExportGeometry(analysis);
  const tableWidth = geo.tableWidth;
  const tableLength = geo.tableLength;
  const distDisplayToTable = geo.distDisplayToTable;
  const frntWallToTv = geo.frntWallToTv;
  const tvDiag = geo.tvDiag;
  const drpTvNum = geo.drpTvNum;

  return {
    name,
    date: new Date().toISOString(),
    roomId: crypto.randomUUID(),
    version: VIDEO_ROOM_CALC_FILE_VERSION,
    unit,
    room: {
      roomWidth: d.width,
      roomLength: d.length,
      roomHeight: d.height,
      tableWidth,
      tableLength,
      distDisplayToTable,
      frntWallToTv,
      tvDiag,
      drpTvNum,
      ...defaultRoomCalculationFields(unit),
    },
    software: "",
    authorVersion: "snaproom",
    roomAi,
    items: buildQuickSetupItems({
      unit,
      roomWidth: d.width,
      roomLength: d.length,
      tableWidth,
      tableLength,
      distDisplayToTable,
      frntWallToTv,
      tvDiag,
      drpTvNum,
      seatCount: geo.seatCount,
      sittingSideOnly: isPersonalWorkspace(analysis.roomSummary.likelyUse),
    }),
    trNodes: [],
    workspace: {
      removeDefaultWalls: false,
      addCeiling: false,
      theme: "standard",
    },
    layersVisible: {
      grShadingCamera: true,
      grDisplayDistance: true,
      grShadingMicrophone: true,
      gridLines: true,
      grShadingSpeaker: true,
      grLabels: false,
    },
    roomSurfaces: {
      leftwall: { type: "regular", acousticTreatment: true },
      videowall: { type: "regular", acousticTreatment: false },
      rightwall: { type: "regular", acousticTreatment: false },
      backwall: { type: "regular", acousticTreatment: false },
    },
  };
}

export function vrcJsonFileName(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, "-").trim() || "VideoRoomCalc";
  return `${base}.vrc.json`;
}

function looksLikeVideoRoomCalculatorJson(raw: Record<string, unknown>): boolean {
  const room = raw.room;
  if (!room || typeof room !== "object") return false;
  const r = room as Record<string, unknown>;
  return Boolean(
    r.roomWidth &&
      r.roomLength &&
      typeof r.roomHeight !== "undefined"
  );
}

export type TryBuildVrcFromJsonResult =
  | { ok: true; vrc: VideoRoomCalculatorJson }
  | { ok: false; error: string };

/**
 * Turn a pasted/saved JSON into a Collab-importable `.vrc.json`:
 * - `{ ok: true, data: RoomAnalysis }` (room-ai export / room-analysis*.json)
 * - or a bare `RoomAnalysis` object.
 * Already-native VRC files are rejected so we don't duplicate confusingly.
 */
export function tryBuildVrcFromRoomAiJson(
  raw: unknown
): TryBuildVrcFromJsonResult {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, error: "Not a JSON object." };
  }

  const o = raw as Record<string, unknown>;

  if (looksLikeVideoRoomCalculatorJson(o)) {
    return {
      ok: false,
      error:
        "This file already looks like Video Room Calculator JSON (it has top-level room.roomWidth). Open it on collabexperience.com with New → Open File. If import still fails, re-download using “Download for Collab Experience” from this app.",
    };
  }

  if (o.ok === true && o.data !== null && typeof o.data === "object") {
    const parsed = roomAnalysisSchema.safeParse(coerceRoomAnalysisPayload(o.data));
    if (!parsed.success) {
      return {
        ok: false,
        error: `Envelope has ok/data but data is not valid analysis: ${parsed.error.message}`,
      };
    }
    const meta =
      o.meta !== null &&
      typeof o.meta === "object" &&
      !Array.isArray(o.meta)
        ? (o.meta as { provider?: string; model?: string })
        : undefined;
    const vrc = buildVideoRoomCalculatorJson(parsed.data, { meta });
    return { ok: true, vrc };
  }

  const direct = roomAnalysisSchema.safeParse(coerceRoomAnalysisPayload(raw));
  if (direct.success) {
    return { ok: true, vrc: buildVideoRoomCalculatorJson(direct.data) };
  }

  return {
    ok: false,
    error:
      'Unrecognized JSON. For collabexperience.com you need a .vrc.json (use “Download for Collab Experience”), not the "{ ok, data }" export. You can convert the latter with the tool below.',
  };
}
