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
import {
  coerceRoomAnalysisPayload,
  type CoerceRoomAnalysisOptions,
} from "../src/lib/coerceRoomAnalysis";
import { DEMO_TOUR_ANALYSIS } from "../src/lib/demoAnalysisFixture";
import {
  CISCO_GUIDANCE_URL,
  parseRecommendationItems,
  parseRecommendationLine,
} from "../src/lib/recommendationDisplay";
import { roomAnalysisSchema, type RoomAnalysis } from "../src/lib/roomAnalysis";
import {
  clampFocusBox,
  coerceFocusRegions,
  resolveFocusRegion,
} from "../src/lib/focusRegions";
import {
  designerSeatCount,
  effectiveSeatCount,
  resultsHeadline,
  resultsSizeCaption,
  resultsVerdict,
} from "../src/lib/roomSizing";
import { buildWebexDesignerSummaryUrl } from "../src/lib/webexDesignerQuickUrl";

function must<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

function analysisFrom(
  partial: unknown,
  options?: CoerceRoomAnalysisOptions,
): RoomAnalysis {
  const parsed = roomAnalysisSchema.safeParse(
    coerceRoomAnalysisPayload(partial, options),
  );
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return parsed.data;
}

function fail(message: string): never {
  throw new Error(message);
}

function roundNear(n: number): number {
  return Math.round((n + 0.12) * 1000) / 1000;
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
if (conferenceSeats !== designerSeatCount(conference)) {
  fail("Conference headline seats should match Designer seats.");
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
const micY = (mic.position as number[])[1];
if (Math.abs(micY - 0.7) > 0.001) {
  fail(`Table mic should rest on the 0.7 m tabletop, got y ${micY}`);
}
if (!designer.customObjects.some((o) => o.objectType === "navigator")) {
  fail("Medium room should include a table navigator.");
}
if (!designer.customObjects.some((o) => o.objectType === "scheduler")) {
  fail("Medium room should include a navigator outside the room.");
}
if (screen.size !== 75) {
  fail(`Medium room screen should be 75 from estimate, got ${String(screen.size)}`);
}
const screenPos = screen.position as [number, number, number];
const screenYaw = (screen.rotation as [number, number, number])[1];
const frontZ = roundNear(-designer.roomShape.length / 2);
if (screen.role !== "singleScreen") {
  fail(`Conference with one display should be singleScreen, got ${String(screen.role)}`);
}
if (Math.abs(screenPos[0]) > 0.05 || Math.abs(screenPos[2] - frontZ) > 0.05) {
  fail(
    `Conference screen should sit on the front wall, got [${screenPos.join(", ")}]`,
  );
}
if (Math.abs(screenYaw) > 0.05) {
  fail(`Front-wall screen yaw should be 0, got ${screenYaw}`);
}
const videoPos = video.position as [number, number, number];
if (Math.abs(videoPos[0]) > 0.05 || Math.abs(videoPos[2] - frontZ) > 0.05) {
  fail(`Room bar should sit with the front-wall screen, got [${videoPos.join(", ")}]`);
}

const dual = analysisFrom({
  ...conference,
  roomSummary: { ...conference.roomSummary, screenCount: 2 },
});
const dualDesigner = buildWebexDesignerRoomJson(dual);
const dualScreens = dualDesigner.customObjects.filter((o) => o.objectType === "screen");
if (dualScreens.length !== 2) {
  fail(`Two displays should export two Designer screens, got ${dualScreens.length}`);
}
const dualRoles = dualScreens.map((o) => String(o.role)).sort();
if (dualRoles.join(",") !== "firstScreen,secondScreen") {
  fail(`Dual screens should be firstScreen and secondScreen, got ${dualRoles.join(", ")}`);
}
const dualZs = dualScreens.map((o) => (o.position as number[])[2]);
const dualXs = dualScreens.map((o) => (o.position as number[])[0]);
const dualYs = dualScreens.map((o) => (o.position as number[])[1]);
if (dualZs.some((z) => Math.abs(z - frontZ) > 0.05)) {
  fail(`Dual screens should share the front wall, got z ${dualZs.join(", ")}`);
}
const aspect = 16 / 9;
const panelWidth =
  ((0.025 * 75) / Math.sqrt(1 + aspect * aspect)) * aspect;
const separation = Math.abs((dualXs[0] ?? 0) - (dualXs[1] ?? 0));
if (Math.abs(separation - panelWidth) > 0.02) {
  fail(
    `Dual screens should meet at the bezel (${panelWidth.toFixed(3)} m apart), got ${separation.toFixed(3)} m`,
  );
}
const scale = dualScreens[0]?.scale as number[];
if (!scale || Math.abs(scale[0] - 75 / 55) > 0.01) {
  fail(`Screen scale should be 75/55 so Designer draws a 75" panel, got ${scale?.join(",")}`);
}
const dualBar = must(
  dualDesigner.customObjects.find((o) => o.objectType === "videoDevice"),
  "Dual room missing video bar",
);
const dualBarY = (dualBar.position as number[])[1];
const screenTop = (dualYs[0] ?? 0) + (0.025 * 75) / Math.sqrt(1 + aspect * aspect) / 2;
if (Math.abs(dualBarY - screenTop) > 0.02) {
  fail(
    `Video bar should sit on top of the screens (y ${screenTop.toFixed(3)}), got ${dualBarY}`,
  );
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
const huddleUrl = buildWebexDesignerSummaryUrl(
  designerSeatCount(huddle),
  huddle.roomSummary.likelyUse,
);

if (huddleGeo.layoutKind !== "huddle") fail("small-office should map to huddle.");
if (huddleSeats > 2) fail(`small-office occupancy 4 must cap at 2 seats, got ${huddleSeats}`);
if (huddleGeo.device.id !== "webexDeskProG2") {
  fail(`Small-office VRC device should be Desk Pro G2, got ${huddleGeo.device.id}`);
}
if (huddleVrc.room.tvDiag !== 43) {
  fail(`Huddle VRC tvDiag should be 43, got ${huddleVrc.room.tvDiag}`);
}
if (huddleVrc.room.tableWidth === 4 && huddleVrc.room.tableLength === 10) {
  fail("Huddle VRC should not use 4×10.");
}
if (huddleUrl !== "https://designer.webex.com/#/room/huddleroom/summary?1&rt=Huddle%20Room&ch=2") {
  fail(`Unexpected huddle Designer URL: ${huddleUrl}`);
}
const huddleVideo = must(
  huddleDesigner.customObjects.find((o) => o.objectType === "videoDevice"),
  "Huddle Designer JSON missing video device",
);
if (huddleVideo.model !== "Desk Pro G2") {
  fail(`Small-office Designer JSON should export Desk Pro G2, got ${String(huddleVideo.model)}`);
}
if (huddleDesigner.customObjects.some((o) => o.objectType === "screen")) {
  fail("Small-office Designer JSON must not add a wall screen beside the Desk Pro");
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
  roomSummary: { ...compact.roomSummary, likelyUse: "unknown", occupancy: 0 },
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
if (unknownVrc.name !== "SnapRoom — Meeting Room") {
  fail(`Expected fallback VRC name "SnapRoom — Meeting Room", got "${unknownVrc.name}"`);
}

if (compactBuckets.tables.length < 1) fail("VRC tables.length must be >= 1");
if (compactBuckets.displays.length < 1) fail("VRC displays.length must be >= 1");
if (compactBuckets.chairs.length < 1) fail("VRC chairs.length must be >= 1");
if (!compactBuckets.videoDevices.some((d) => d.data_deviceid === "roomBarPro")) {
  fail("VRC videoDevices must include roomBarPro");
}
const compactDisplay = compactBuckets.displays[0];
const compactBar = compactBuckets.videoDevices[0];
if (
  compactDisplay &&
  compactBar &&
  Math.abs((compactBar.y ?? 0) - (compactDisplay.y ?? 0)) > 0.02
) {
  fail("Room bar should sit on the display wall, not in front of it");
}
const compactIds = new Set(vrcItemList(compactVrc).map((item) => item.data_deviceid));
for (const id of ["tableMicPro", "navigatorTable", "navigatorWall"]) {
  if (!compactIds.has(id)) fail(`Conference VRC missing ${id}`);
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
  "tableMicPro",
  "navigatorTable",
  "navigatorWall",
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

const office = analysisFrom({
  dimensions: {
    unit: "feet",
    length: 10,
    width: 12,
    height: 10,
    heightMin: 9.5,
    heightMax: 10.5,
    confidence: 0.62,
  },
  roomSummary: {
    likelyUse: "home",
    occupancy: 1,
    primaryScreenDiagonalInches: 55,
    screenCount: 3,
  },
  detectedReference: {
    type: "chair",
    notes: "Standing desk and one task chair.",
  },
  recommendations: {
    camera: [
      "Mount a USB camera at eye level. (see https://www.cisco.com/c/dam/en/us/td/docs/telepresence/endpoint/technical-papers/workspace-best-practices.pdf)",
      "b",
    ],
    lighting: ["a", "b"],
    acoustics: ["a", "b"],
    display: [
      "Keep one display 6–8 ft from the chair. [Cisco guidance](https://www.cisco.com/c/en/us/products/collaboration-endpoints/index.html)",
      "b",
    ],
    seating: ["a", "b"],
    cabling: ["a", "b"],
    network: ["a", "b"],
    power: ["a", "b"],
  },
  quickChecklist: ["a", "b", "c"],
});

const officeSeats = effectiveSeatCount(office);
const officeDesignerSeats = designerSeatCount(office);
const officeUrl = buildWebexDesignerSummaryUrl(
  officeDesignerSeats,
  office.roomSummary.likelyUse,
);
const officeGeo = deriveCollabExportGeometry(office);
const officeVrc = buildVideoRoomCalculatorJson(office);
const officeBuckets = vrcBuckets(officeVrc);
const officeHeadline = resultsHeadline(office);

if (office.roomSummary.likelyUse !== "home") {
  fail(`Home fixture likelyUse should stay home, got ${office.roomSummary.likelyUse}`);
}
if (officeSeats !== 1) fail(`Home office occupancy 1 should be 1 seat, got ${officeSeats}`);
if (officeDesignerSeats !== 2) {
  fail(`Designer seats for home office should be 2, got ${officeDesignerSeats}`);
}
if (
  !officeHeadline.startsWith("Home Office · 1 seat") ||
  !officeHeadline.includes("about 10 × 12")
) {
  fail(`Unexpected home office headline: ${officeHeadline}`);
}
if (officeUrl !== "https://designer.webex.com/#/room/huddleroom/summary?1&rt=Huddle%20Room&ch=2") {
  fail(`Home office Designer URL should be huddleroom ch=2, got ${officeUrl}`);
}
if (officeVrc.name !== "SnapRoom — Home Office") {
  fail(`Expected VRC name "SnapRoom — Home Office", got "${officeVrc.name}"`);
}
if (office.dimensions.height > 9 || Number(officeVrc.room.roomHeight) > 9) {
  fail(
    `Home office height should cap at 9 ft, got analysis ${office.dimensions.height} VRC ${officeVrc.room.roomHeight}`,
  );
}

const knownOffice = analysisFrom(
  {
    dimensions: {
      unit: "feet",
      length: 10,
      width: 12,
      height: 8,
      heightMin: 7.5,
      heightMax: 8.5,
      confidence: 0.62,
    },
    roomSummary: {
      likelyUse: "home",
      occupancy: 1,
      primaryScreenDiagonalInches: 55,
      screenCount: 1,
    },
  },
  { knownCeilingHeight: 10, unit: "feet" },
);
const knownOfficeVrc = buildVideoRoomCalculatorJson(knownOffice);
const knownOfficeDesigner = buildWebexDesignerRoomJson(knownOffice);
if (knownOffice.dimensions.height !== 10) {
  fail(`Known 10 ft ceiling must stay 10, got ${knownOffice.dimensions.height}`);
}
if (Number(knownOfficeVrc.room.roomHeight) !== 10) {
  fail(`VRC roomHeight must use analysis height 10, got ${knownOfficeVrc.room.roomHeight}`);
}
if (resultsSizeCaption(knownOffice) !== "about 10 × 12 ft · ceiling 10 ft") {
  fail(`Known ceiling caption should separate the estimate, got ${resultsSizeCaption(knownOffice)}`);
}
if (!resultsVerdict(knownOffice).includes("Ceiling height is what you entered.")) {
  fail(`Verdict should say the ceiling was entered, got ${resultsVerdict(knownOffice)}`);
}
if (knownOfficeDesigner.roomShape.height !== 3.048) {
  fail(
    `Designer roomShape.height must be 10 ft in meters (3.048), got ${knownOfficeDesigner.roomShape.height}`,
  );
}
if (officeGeo.layoutKind !== "huddle") fail("Home office layout should be huddle.");
if (officeGeo.drpTvNum !== 0) {
  fail(`Home office uses a Desk Pro, not a wall display, got drpTvNum ${officeGeo.drpTvNum}`);
}
if (officeGeo.device.id !== "webexDeskProG2") {
  fail(`Home office VRC device should be webexDeskProG2, got ${officeGeo.device.id}`);
}
const officeDesigner = buildWebexDesignerRoomJson(office);
const officeDesk = officeDesigner.customObjects.find((o) => o.objectType === "videoDevice");
if (officeDesk?.model !== "Desk Pro G2" || officeDesk.mount !== "desk") {
  fail(`Home office Designer device should be a desk-mounted Desk Pro G2, got ${JSON.stringify(officeDesk)}`);
}
if (officeDesigner.customObjects.some((o) => o.objectType === "screen")) {
  fail("Home office Designer JSON must not add a wall screen beside the Desk Pro");
}
if (officeDesigner.customObjects.some((o) => o.model === "Room Bar" || o.model === "Room Bar Pro")) {
  fail("Home office Designer JSON must not add a Room Bar");
}
if (officeGeo.tableWidth < 3 || officeGeo.tableWidth > 3.5) {
  fail(`Home office table width should be ~3–3.5 ft, got ${officeGeo.tableWidth}`);
}
if (officeGeo.tableLength < 4 || officeGeo.tableLength > 5) {
  fail(`Home office table length should be ~4–5 ft, got ${officeGeo.tableLength}`);
}
if (
  officeGeo.tableWidth >= officeVrc.room.roomWidth ||
  officeGeo.tableLength >= officeVrc.room.roomLength
) {
  fail("Home office table must be smaller than the room.");
}
if (officeBuckets.displays.length !== 0) {
  fail(`Home office should not include a wall display, got ${officeBuckets.displays.length}`);
}
if (officeBuckets.videoDevices.length !== 0) {
  fail("Home office VRC must not include a Room Bar");
}
const officeDeskPro = vrcItemList(officeVrc).find((item) => item.data_deviceid === "webexDeskProG2");
if (!officeDeskPro) fail("Home office VRC must include webexDeskProG2");
const officeChairs = officeBuckets.chairs.filter((c) => (c.data_deviceid ?? "") === "chair");
const officeWallChairs = officeBuckets.chairs.filter((c) =>
  (c.data_deviceid ?? "").startsWith("wallChairs"),
);
if (officeWallChairs.length > 0) fail("Home office must not emit wallChairs rows");
if (officeChairs.length < 1 || officeChairs.length > 2) {
  fail(`Home office chairs should be 1–2, got ${officeChairs.length}`);
}
for (const chair of officeChairs) {
  if ((Number(chair.y) || 0) <= (Number(officeDeskPro?.y) || 0) + 0.4) {
    fail(`Office chair overlaps the Desk Pro: y=${chair.y} deskY=${officeDeskPro?.y}`);
  }
  if (!itemInsideRoom(chair, officeVrc.room.roomWidth, officeVrc.room.roomLength, true)) {
    fail(`Office chair outside room: x=${chair.x} y=${chair.y}`);
  }
}
for (const table of officeBuckets.tables) {
  if (!itemInsideRoom(table, officeVrc.room.roomWidth, officeVrc.room.roomLength, false)) {
    fail(`Office table overflows room`);
  }
  if (Math.abs(Number(table.width) - officeVrc.room.tableWidth) > 0.05) {
    fail("Office 2D table width must match the canvas item.");
  }
  if (Math.abs(Number(table.height) - officeVrc.room.tableLength) > 0.05) {
    fail("Office 2D table length must match the canvas item.");
  }
}

const officeAreaTrap = analysisFrom({
  dimensions: {
    unit: "feet",
    length: 14,
    width: 12,
    height: 9,
    confidence: 0.6,
  },
  roomSummary: {
    likelyUse: "small-office",
    occupancy: 1,
    primaryScreenDiagonalInches: 55,
    screenCount: 1,
  },
  detectedReference: { type: "chair", notes: "Home office in a 12×14 room." },
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
if (effectiveSeatCount(officeAreaTrap) !== 1) {
  fail(
    `12×14 home/small-office occupancy 1 must stay 1 seat, got ${effectiveSeatCount(officeAreaTrap)}`,
  );
}
const officeAreaUrl = buildWebexDesignerSummaryUrl(
  designerSeatCount(officeAreaTrap),
  officeAreaTrap.roomSummary.likelyUse,
);
if (!officeAreaUrl.includes("huddleroom") || !officeAreaUrl.includes("ch=2")) {
  fail(`12×14 home office must open huddleroom ch=2, got ${officeAreaUrl}`);
}

const unknownOneChair = analysisFrom({
  dimensions: {
    unit: "feet",
    length: 12,
    width: 14,
    height: 10,
    confidence: 0.55,
  },
  roomSummary: {
    likelyUse: "meeting room",
    occupancy: 1,
    primaryScreenDiagonalInches: 55,
    screenCount: 2,
  },
  detectedReference: { type: "chair", notes: "One task chair." },
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
if (unknownOneChair.roomSummary.likelyUse !== "home") {
  fail(
    `Unknown/meeting-room + 1 chair should resolve to home, got ${unknownOneChair.roomSummary.likelyUse}`,
  );
}
if (effectiveSeatCount(unknownOneChair) !== 1) {
  fail(
    `Unknown 12×14 occupancy 1 must not use the 6-seat area rule, got ${effectiveSeatCount(unknownOneChair)}`,
  );
}

const parsedDam = parseRecommendationLine(
  "Mount a USB camera at eye level. (see https://www.cisco.com/c/dam/en/us/td/docs/telepresence/endpoint/technical-papers/workspace-best-practices.pdf)",
);
if (!parsedDam.href || parsedDam.href !== CISCO_GUIDANCE_URL) {
  fail(`DAM PDF should rewrite to Cisco guidance URL, got ${parsedDam.href}`);
}
if (/https?:\/\//i.test(parsedDam.text) || /cisco\.com\/c\/dam/i.test(parsedDam.text)) {
  fail(`Rec text still contains a raw URL: ${parsedDam.text}`);
}
if (parsedDam.text.length > 90) fail(`Rec text longer than 90 chars: ${parsedDam.text}`);

const parsedMd = parseRecommendationLine(
  "Keep one display 6–8 ft from the chair. [Cisco guidance](https://www.cisco.com/c/en/us/products/collaboration-endpoints/index.html)",
);
if (parsedMd.href !== CISCO_GUIDANCE_URL) {
  fail(`Markdown Cisco link should survive, got ${parsedMd.href}`);
}
if (parsedMd.text.includes("http") || parsedMd.text.includes("Cisco guidance")) {
  fail(`Markdown should strip from sentence: ${parsedMd.text}`);
}

const parsedFull = parseRecommendationLine(
  "Mount a USB camera at eye level. Keep windows out of frame.",
);
if (parsedFull.text !== "Mount a USB camera at eye level. Keep windows out of frame.") {
  fail(`Should keep every sentence after URL strip, got ${parsedFull.text}`);
}

const parsedJoined = parseRecommendationItems([
  "Keep cameras at eye height.",
  "Check backlight.",
]);
if (parsedJoined.text !== "Keep cameras at eye height. Check backlight.") {
  fail(`Should join every rec string, got ${parsedJoined.text}`);
}

const clamped = clampFocusBox({ x: -0.2, y: 0.9, w: 0.8, h: 0.4 });
if (!clamped || clamped.x !== 0 || clamped.y !== 0.9 || clamped.w !== 0.8 || clamped.h < 0.09) {
  fail(`clampFocusBox should clamp to 0–1, got ${JSON.stringify(clamped)}`);
}
const percent = clampFocusBox({ x: 10, y: 20, w: 30, h: 40 });
if (
  !percent ||
  Math.abs(percent.x - 0.1) > 0.001 ||
  Math.abs(percent.y - 0.2) > 0.001 ||
  Math.abs(percent.w - 0.3) > 0.001 ||
  Math.abs(percent.h - 0.4) > 0.001
) {
  fail(`0–100 boxes should scale to 0–1, got ${JSON.stringify(percent)}`);
}
const coercedRegions = coerceFocusRegions({
  display: { x: 0.02, y: 0.08, w: 0.48, h: 0.55 },
  camera: { x: "nope", y: 0, w: 1, h: 1 },
});
if (!coercedRegions?.display || coercedRegions.camera) {
  fail("coerceFocusRegions should keep valid boxes and drop invalid ones");
}

const homeCam = resolveFocusRegion("camera", undefined);
if (homeCam !== null) {
  fail(`Missing model box must not invent a home-office spotlight, got ${JSON.stringify(homeCam)}`);
}
const confDisplay = resolveFocusRegion("display", undefined);
if (confDisplay !== null) {
  fail(`Missing model box must not invent a conference spotlight, got ${JSON.stringify(confDisplay)}`);
}
const vague = clampFocusBox({ x: 0.02, y: 0.02, w: 0.95, h: 0.9 });
if (vague) {
  fail(`Whole-frame boxes should be dropped, got ${JSON.stringify(vague)}`);
}
const pinned = resolveFocusRegion("display", {
  display: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
});
if (!pinned || pinned.x !== 0.1 || pinned.w !== 0.3) {
  fail("Model focusRegions should be used when present");
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
  `  12×14.5 occ 2 conference → ${compactSeats} seats, ${compactUrl}`,
);
console.log(
  `  home office 12×10 occ 1 → ${officeSeats} seat, ${officeUrl}, table ${officeGeo.tableWidth}×${officeGeo.tableLength}`,
);
