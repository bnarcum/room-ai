/**
 * Assert VRC + Designer exports follow the estimate — not hardcoded 4×10 / 65"
 * or a default boardroom + Room Bar Pro + Table Mic.
 */
import { buildWebexDesignerRoomJson } from "webex-designer-export";

import { deriveCollabExportGeometry } from "../src/lib/collabExportGeometry";
import {
  VIDEO_ROOM_CALC_FILE_VERSION,
  buildVideoRoomCalculatorJson,
} from "../src/lib/collabExperienceExport";
import { coerceRoomAnalysisPayload } from "../src/lib/coerceRoomAnalysis";
import { DEMO_TOUR_ANALYSIS } from "../src/lib/demoAnalysisFixture";
import { roomAnalysisSchema, type RoomAnalysis } from "../src/lib/roomAnalysis";
import { effectiveSeatCount } from "../src/lib/roomSizing";
import { buildWebexDesignerSummaryUrl } from "../src/lib/webexDesignerQuickUrl";

function must<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

function analysisFrom(partial: unknown): RoomAnalysis {
  const parsed = roomAnalysisSchema.safeParse(coerceRoomAnalysisPayload(partial));
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return parsed.data;
}

function fail(message: string): never {
  throw new Error(message);
}

const conference = analysisFrom(DEMO_TOUR_ANALYSIS.data);
const geo = deriveCollabExportGeometry(conference);
const vrc = buildVideoRoomCalculatorJson(conference);
const designer = buildWebexDesignerRoomJson(conference);
const conferenceSeats = effectiveSeatCount(conference);
const designerUrl = buildWebexDesignerSummaryUrl(conferenceSeats);

if (vrc.room.tableWidth === 4 && vrc.room.tableLength === 10) {
  fail("Conference VRC still uses hardcoded 4×10 table.");
}
if (vrc.room.tvDiag === 65) {
  fail("Conference VRC still uses hardcoded 65\" TV.");
}
if (vrc.room.tvDiag !== conference.roomSummary.primaryScreenDiagonalInches) {
  fail(
    `VRC tvDiag ${vrc.room.tvDiag} != estimate ${conference.roomSummary.primaryScreenDiagonalInches}`,
  );
}
if (vrc.room.tableWidth !== geo.tableWidth || vrc.room.tableLength !== geo.tableLength) {
  fail("VRC table does not match derived geometry.");
}
if (geo.device.id !== "roomBarPro") {
  fail(`Expected Room Bar Pro for medium room VRC, got ${geo.device.id}`);
}
if (!designerUrl.includes("/mediumroom/") || !designerUrl.includes(`ch=${conferenceSeats}`)) {
  fail(`Unexpected Designer URL: ${designerUrl}`);
}

const video = must(
  designer.customObjects.find((o) => o.objectType === "videoDevice"),
  "Designer JSON missing video device",
);
const mic = designer.customObjects.find((o) => o.objectType === "microphone");
const screen = must(
  designer.customObjects.find((o) => o.objectType === "screen"),
  "Designer JSON missing screen",
);
if (video.model !== "Room Bar Pro") {
  fail(`Medium room should use Room Bar Pro, got ${String(video.model)}`);
}
if (!mic || mic.model !== "Table Mic Pro") {
  fail("Medium room should include Table Mic Pro.");
}
if (screen.size !== 75) {
  fail(`Medium room screen should be 75 from estimate, got ${String(screen.size)}`);
}

const huddle = analysisFrom({
  dimensions: { unit: "feet", length: 10, width: 9, height: 8, confidence: 0.6 },
  roomSummary: {
    likelyUse: "small-office",
    occupancy: 4,
    primaryScreenDiagonalInches: 43,
    screenCount: 1,
  },
  detectedReference: { type: "table", notes: "Small huddle table." },
  recommendations: {
    camera: ["a", "b"],
    lighting: ["a", "b"],
    acoustics: ["a", "b"],
    display: ["a", "b"],
    seating: ["a", "b"],
    cabling: ["a", "b"],
    network: ["a", "b"],
    power: ["a", "b"],
  },
  quickChecklist: ["a", "b", "c"],
});
const huddleGeo = deriveCollabExportGeometry(huddle);
const huddleVrc = buildVideoRoomCalculatorJson(huddle);
const huddleDesigner = buildWebexDesignerRoomJson(huddle);
const huddleSeats = effectiveSeatCount(huddle);
const huddleUrl = buildWebexDesignerSummaryUrl(huddleSeats);

if (huddleGeo.layoutKind !== "huddle") fail("4 seats should map to huddle.");
if (huddleGeo.device.id !== "roomBarPro") {
  fail(`Huddle VRC device should be Room Bar Pro, got ${huddleGeo.device.id}`);
}
if (huddleVrc.room.tvDiag !== 43) {
  fail(`Huddle VRC tvDiag should be 43, got ${huddleVrc.room.tvDiag}`);
}
if (huddleVrc.room.tableWidth === 4 && huddleVrc.room.tableLength === 10) {
  fail("Huddle VRC should not use 4×10.");
}
if (huddleUrl !== "https://designer.webex.com/#/room/huddleroom/summary?1&rt=Huddle%20Room&ch=4") {
  fail(`Unexpected huddle Designer URL: ${huddleUrl}`);
}
const huddleVideo = must(
  huddleDesigner.customObjects.find((o) => o.objectType === "videoDevice"),
  "Huddle Designer JSON missing video device",
);
if (huddleVideo.model !== "Room Bar") {
  fail(`Huddle Designer JSON should export Room Bar, got ${String(huddleVideo.model)}`);
}
if (huddleDesigner.customObjects.some((o) => o.objectType === "microphone")) {
  fail("Huddle should not include Table Mic Pro.");
}

type VrcItem = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  data_deviceid?: string;
};

function vrcItemList(doc: ReturnType<typeof buildVideoRoomCalculatorJson>): VrcItem[] {
  const raw = doc.items as unknown;
  if (Array.isArray(raw)) return raw as VrcItem[];
  if (raw && typeof raw === "object") {
    return Object.values(raw as Record<string, unknown[]>).flat() as VrcItem[];
  }
  return [];
}

function vrcBuckets(doc: ReturnType<typeof buildVideoRoomCalculatorJson>): {
  tables: VrcItem[];
  displays: VrcItem[];
  videoDevices: VrcItem[];
  chairs: VrcItem[];
} {
  const raw = doc.items as unknown;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, VrcItem[]>;
    return {
      tables: o.tables ?? [],
      displays: o.displays ?? [],
      videoDevices: o.videoDevices ?? [],
      chairs: o.chairs ?? [],
    };
  }
  const items = vrcItemList(doc);
  const id = (item: VrcItem) => item.data_deviceid ?? "";
  return {
    tables: items.filter((it) => id(it) === "tblRect"),
    displays: items.filter((it) => id(it).startsWith("display")),
    videoDevices: items.filter((it) => id(it) === "roomBarPro" || id(it) === "roomBar"),
    chairs: items.filter((it) => id(it) === "chair" || id(it).startsWith("wallChairs")),
  };
}

function itemInsideRoom(
  item: VrcItem,
  roomWidth: number,
  roomLength: number,
  centered: boolean,
): boolean {
  const x = Number(item.x);
  const y = Number(item.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (centered) {
    return x >= 0 && x <= roomWidth && y >= 0 && y <= roomLength;
  }
  const w = Number(item.width) || 0;
  const h = Number(item.height) || 0;
  return x >= -0.05 && y >= -0.05 && x + w <= roomWidth + 0.05 && y + h <= roomLength + 0.05;
}

const compact = analysisFrom({
  dimensions: {
    unit: "feet",
    length: 14.5,
    width: 12,
    height: 10,
    confidence: 0.7,
  },
  roomSummary: {
    likelyUse: "conference",
    occupancy: 2,
    primaryScreenDiagonalInches: 55,
    screenCount: 1,
  },
  detectedReference: { type: "table", notes: "Small conference table." },
  recommendations: {
    camera: ["a", "b"],
    lighting: ["a", "b"],
    acoustics: ["a", "b"],
    display: ["a", "b"],
    seating: ["a", "b"],
    cabling: ["a", "b"],
    network: ["a", "b"],
    power: ["a", "b"],
  },
  quickChecklist: ["a", "b", "c"],
});

const compactSeats = effectiveSeatCount(compact);
const compactUrl = buildWebexDesignerSummaryUrl(compactSeats);
const compactDesigner = buildWebexDesignerRoomJson(compact);
const compactVrc = buildVideoRoomCalculatorJson(compact);
const compactBuckets = vrcBuckets(compactVrc);

if (compactSeats < 6) {
  fail(`12×14.5 ft with occupancy 2 should seat at least ~6, got ${compactSeats}`);
}
if (compactUrl.includes("huddleroom") || compactUrl.includes("ch=2")) {
  fail(`12×14.5 ft must not map to huddleroom ch=2: ${compactUrl}`);
}
if (!/\/(smallroom|mediumroom)\//.test(compactUrl)) {
  fail(`12×14.5 ft Designer slug should be smallroom or mediumroom: ${compactUrl}`);
}

const designerChairs = compactDesigner.customObjects.filter((o) => o.objectType === "chair");
if (designerChairs.length < 6) {
  fail(`Designer JSON should use area-based seats, got ${designerChairs.length} chairs`);
}
if (compactDesigner.title !== "SnapRoom — Conference") {
  fail(`Designer title should be SnapRoom — Conference, got "${compactDesigner.title}"`);
}

const unknownUse = analysisFrom({
  ...compact,
  roomSummary: { ...compact.roomSummary, likelyUse: "unknown" },
});
const unknownVrc = buildVideoRoomCalculatorJson(unknownUse);
const unknownDesigner = buildWebexDesignerRoomJson(unknownUse);
if (/unknown/i.test(unknownVrc.name) || /unknown/i.test(unknownDesigner.title)) {
  fail(
    `Title must not say unknown (VRC="${unknownVrc.name}", Designer="${unknownDesigner.title}")`,
  );
}
if (compactVrc.name !== "SnapRoom — Conference") {
  fail(`Expected VRC name "SnapRoom — Conference", got "${compactVrc.name}"`);
}
if (unknownVrc.name !== "SnapRoom — Meeting room") {
  fail(`Expected fallback VRC name "SnapRoom — Meeting room", got "${unknownVrc.name}"`);
}

if (compactBuckets.tables.length < 1) fail("VRC tables.length must be >= 1");
if (compactBuckets.displays.length < 1) fail("VRC displays.length must be >= 1");
if (compactBuckets.chairs.length < 1) fail("VRC chairs.length must be >= 1");
if (!compactBuckets.videoDevices.some((d) => d.data_deviceid === "roomBarPro")) {
  fail("VRC videoDevices must include roomBarPro");
}
if (compactBuckets.videoDevices.some((d) => d.data_deviceid === "roomBar")) {
  fail("Do not emit unverified roomBar data_deviceid; use roomBarPro");
}

const knownIds = new Set([
  "roomBarPro",
  "tblRect",
  "displaySngl_2",
  "displayDbl_2",
  "displayTrpl_2",
  "chair",
  "wallChairs",
  "wallChairsSwivel",
  "wallChairsStool",
]);
for (const item of vrcItemList(compactVrc)) {
  const id = item.data_deviceid ?? "";
  if (!knownIds.has(id)) {
    fail(`Unknown VRC data_deviceid "${id}"`);
  }
}

const roomW = compactVrc.room.roomWidth;
const roomL = compactVrc.room.roomLength;
for (const table of compactBuckets.tables) {
  if (!itemInsideRoom(table, roomW, roomL, false)) {
    fail(`Table overflows room: x=${table.x} y=${table.y} ${table.width}×${table.height}`);
  }
}
for (const item of [...compactBuckets.displays, ...compactBuckets.videoDevices]) {
  if (!itemInsideRoom(item, roomW, roomL, true)) {
    fail(`Device outside room: ${item.data_deviceid} x=${item.x} y=${item.y}`);
  }
}
for (const chair of compactBuckets.chairs) {
  const centered = (chair.data_deviceid ?? "") === "chair";
  if (!itemInsideRoom(chair, roomW, roomL, centered)) {
    fail(`Chair outside room: ${chair.data_deviceid} x=${chair.x} y=${chair.y}`);
  }
}

if (!Array.isArray(compactVrc.items)) {
  fail("VRC items must be a flat array matching current collabexperience.com saves");
}
if (VIDEO_ROOM_CALC_FILE_VERSION !== "v0.1.671") {
  fail(`Pin VRC file version to v0.1.671, got ${VIDEO_ROOM_CALC_FILE_VERSION}`);
}

console.log("OK: VRC and Designer exports follow the estimate");
console.log(`  conference Designer URL: ${designerUrl}`);
console.log(
  `  conference VRC: ${geo.tableWidth}×${geo.tableLength} ${conference.dimensions.unit}, ${geo.tvDiag}", ${geo.device.label}`,
);
console.log(
  `  huddle VRC: ${huddleGeo.tableWidth}×${huddleGeo.tableLength} ft, ${huddleGeo.tvDiag}", ${huddleGeo.device.label}`,
);
console.log(
  `  12×14.5 occ 2 → ${compactSeats} seats, ${compactUrl}`,
);
