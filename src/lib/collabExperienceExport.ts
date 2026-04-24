import {
  roomAnalysisSchema,
  type RoomAnalysis,
} from "@/lib/roomAnalysis";

/**
 * Video Room Calculator native save format (collabexperience.com / Ctrl+S).
 * Import validates: `room` exists, truthy roomWidth & roomLength, and `roomHeight` key present.
 * @see https://github.com/vtjoeh/video_room_calc/blob/main/FAQ.md
 */
export const VIDEO_ROOM_CALC_FILE_VERSION = "v0.1.643" as const;

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
  items: {
    videoDevices: unknown[];
    chairs: unknown[];
    tables: unknown[];
    stageFloors: unknown[];
    boxes: unknown[];
    rooms: unknown[];
    displays: unknown[];
    speakers: unknown[];
    microphones: unknown[];
    touchPanels: unknown[];
  };
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

/**
 * Same geometry as in-app Quick Setup: rectangle table, single display, Room Bar Pro.
 * Without this, import succeeds but the canvas looks “empty” (no equipment on the floor plan).
 */
function buildQuickSetupItems(params: {
  unit: "feet" | "meters";
  roomWidth: number;
  tableWidth: number;
  tableLength: number;
  distDisplayToTable: number;
  frntWallToTv: number;
  tvDiag: number;
  drpTvNum: number;
}): VideoRoomCalculatorJson["items"] {
  const {
    unit,
    roomWidth,
    tableWidth,
    tableLength,
    distDisplayToTable,
    frntWallToTv,
    tvDiag,
    drpTvNum,
  } = params;

  const depthHalfM = (90 / 1000) / 2;
  const offset = unit === "feet" ? depthHalfM * FT_PER_M : depthHalfM;
  const videoY = round2(frntWallToTv - offset);

  const videoZ =
    unit === "feet"
      ? round2((900 / 1000) * FT_PER_M)
      : round2(900 / 1000);

  const displayVertM = 1010 / 1000 - 0.23;
  const displayZ =
    unit === "feet"
      ? round2(displayVertM * FT_PER_M)
      : round2(displayVertM);

  let displayId = "displaySngl_2";
  if (drpTvNum === 2) displayId = "displayDbl_2";
  else if (drpTvNum === 3) displayId = "displayTrpl_3";

  const tableId = crypto.randomUUID();
  const displayIdUuid = crypto.randomUUID();
  const videoId = crypto.randomUUID();

  const tblAttrs = {
    x: round2(roomWidth / 2 - tableWidth / 2),
    y: round2(frntWallToTv + distDisplayToTable),
    width: tableWidth,
    height: tableLength,
    rotation: 0,
    data_deviceid: "tblRect",
    id: tableId,
    name: "Rectangle table",
  };

  const displayAttr = {
    x: round2(roomWidth / 2),
    y: videoY,
    rotation: 0,
    data_diagonalInches: tvDiag,
    data_zPosition: displayZ,
    data_deviceid: displayId,
    id: displayIdUuid,
    name: "Single Display",
  };

  const videoAttr = {
    x: round2(roomWidth / 2),
    y: videoY,
    rotation: 0,
    data_zPosition: videoZ,
    data_deviceid: "roomBarPro",
    id: videoId,
    name: "Room Bar Pro",
  };

  return {
    videoDevices: [videoAttr],
    chairs: [],
    tables: [tblAttrs],
    stageFloors: [],
    boxes: [],
    rooms: [],
    displays: [displayAttr],
    speakers: [],
    microphones: [],
    touchPanels: [],
  };
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
  const use = analysis.roomSummary.likelyUse.replace(/[/\\?%*:|"<>]/g, "-");
  const name = `SnapRoom — ${use}`.trim();

  const roomAi: RoomAiVrcEmbed = {
    embedVersion: ROOM_AI_VRC_EMBED_VERSION,
    generatedAt: new Date().toISOString(),
    ...(options?.meta ? { meta: options.meta } : {}),
    analysis: structuredClone(analysis),
  };

  const tableWidth = 4;
  const tableLength = 10;
  const distDisplayToTable = 5;
  const frntWallToTv = 0.5;
  const tvDiag = 65;
  const drpTvNum = 1;

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
      tableWidth,
      tableLength,
      distDisplayToTable,
      frntWallToTv,
      tvDiag,
      drpTvNum,
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
    const parsed = roomAnalysisSchema.safeParse(o.data);
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

  const direct = roomAnalysisSchema.safeParse(raw);
  if (direct.success) {
    return { ok: true, vrc: buildVideoRoomCalculatorJson(direct.data) };
  }

  return {
    ok: false,
    error:
      'Unrecognized JSON. For collabexperience.com you need a .vrc.json (use “Download for Collab Experience”), not the "{ ok, data }" export. You can convert the latter with the tool below.',
  };
}
