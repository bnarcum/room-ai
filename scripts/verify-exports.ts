/**
 * Assert VRC + Designer exports follow the estimate — not hardcoded 4×10 / 65"
 * or a default boardroom + Room Bar Pro + Table Mic.
 */
import { buildWebexDesignerRoomJson } from "webex-designer-export";

import { deriveCollabExportGeometry } from "../src/lib/collabExportGeometry";
import { buildVideoRoomCalculatorJson } from "../src/lib/collabExperienceExport";
import { coerceRoomAnalysisPayload } from "../src/lib/coerceRoomAnalysis";
import { DEMO_TOUR_ANALYSIS } from "../src/lib/demoAnalysisFixture";
import { roomAnalysisSchema, type RoomAnalysis } from "../src/lib/roomAnalysis";
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
const designerUrl = buildWebexDesignerSummaryUrl(13);

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
  fail(`Expected Room Bar Pro for 13-seat medium room, got ${geo.device.id}`);
}
if (designerUrl !== "https://designer.webex.com/#/room/mediumroom/summary?1&rt=Medium%20Room&ch=13") {
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
const huddleUrl = buildWebexDesignerSummaryUrl(4);

if (huddleGeo.layoutKind !== "huddle") fail("4 seats should map to huddle.");
if (huddleGeo.device.id !== "roomBar") {
  fail(`Huddle device should be Room Bar, got ${huddleGeo.device.id}`);
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
  fail(`Huddle should export Room Bar, got ${String(huddleVideo.model)}`);
}
if (huddleDesigner.customObjects.some((o) => o.objectType === "microphone")) {
  fail("Huddle should not include Table Mic Pro.");
}

console.log("OK: VRC and Designer exports follow the estimate");
console.log(`  conference Designer URL: ${designerUrl}`);
console.log(
  `  conference VRC: ${geo.tableWidth}×${geo.tableLength} ${conference.dimensions.unit}, ${geo.tvDiag}", ${geo.device.label}`,
);
console.log(
  `  huddle VRC: ${huddleGeo.tableWidth}×${huddleGeo.tableLength} ft, ${huddleGeo.tvDiag}", ${huddleGeo.device.label}`,
);
