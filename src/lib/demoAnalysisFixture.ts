import type { RoomAnalysis } from "@/lib/roomAnalysis";
import { saveRoomAnalysisPayload } from "@/lib/resultStorage";

export type DemoAnalysisEnvelope = {
  ok: true;
  meta: { provider: string; model: string };
  data: RoomAnalysis;
};

/** Scripted results aligned with public/demo/conference-room.png. */
export const DEMO_TOUR_ANALYSIS: DemoAnalysisEnvelope = {
  ok: true,
  meta: { provider: "demo", model: "snaproom-tour-fixture" },
  data: {
    dimensions: {
      unit: "feet",
      length: 24,
      width: 16,
      height: 9,
      lengthMin: 22,
      lengthMax: 26,
      widthMin: 14.5,
      widthMax: 17.5,
      heightMin: 8.5,
      heightMax: 9.5,
      confidence: 0.74,
      reasoning:
        "Scaled from the long conference table, chair spacing, and wall-to-window proportions in the isometric view.",
    },
    detectedReference: {
      type: "table",
      notes:
        "Long wood conference table used as the primary scale cue; no door leaf fully visible.",
    },
    roomSummary: {
      likelyUse: "conference",
      occupancy: 13,
      primaryScreenDiagonalInches: 75,
      screenCount: 1,
      keyConstraints: [
        "Strong daylight and garden view on the left wall",
        "Wall-mounted display with flanking cameras on the far wall",
        "Hard floor and area rug may add flutter echo",
      ],
    },
    observedItems: {
      electronicsAndDevices: [
        "Wall-mounted flat-panel display",
        "Flanking room cameras or sensors",
        "Laptops on the conference table",
      ],
      plantsAndDecor: [
        "Large potted plant by the window",
        "Sheer curtains on the garden wall",
        "Center area rug under the table",
      ],
      otherNotable: [
        "Long wood conference table",
        "Thirteen meeting chairs",
      ],
    },
    recommendations: {
      camera: [
        "Keep cameras flanking the display at seated eye height; verify framing for the full table.",
        "Check that the garden window is not backlighting faces toward the camera.",
      ],
      lighting: [
        "Add diffuse fill on the table to balance bright window light from the garden side.",
        "Dim or baffle overheads that wash the wall display.",
      ],
      acoustics: [
        "Consider absorptive panels on the display wall to tame reflections off glass and hard surfaces.",
        "Keep table mics away from the HVAC path along the window wall.",
      ],
      display: [
        "Current large-format display suits the table length; confirm 4K legibility from the far seats.",
        "Treat the estimated 75-inch diagonal as directional until site-measured.",
      ],
      seating: [
        "Thirteen seats fit the table; reserve camera-forward positions for active speakers.",
        "Leave egress behind the window-side chairs.",
      ],
      cabling: [
        "Route table HDMI/USB through a center cable tray to avoid laptop dongle clutter.",
        "Keep floor crossings off the camera-facing aisle.",
      ],
      network: [
        "Place a wired drop at the table center for Room Bar or codec connectivity.",
        "Reserve uplink for HD video plus screen share from the far seats.",
      ],
      power: [
        "Add in-table power modules so laptops do not rely on floor cords crossing walkways.",
        "Confirm the display wall circuit can hold the codec and speakers.",
      ],
    },
    quickChecklist: [
      "Check display glare from the garden window during midday",
      "Confirm camera coverage for all thirteen seats",
      "Verify network and power at the table center",
    ],
    focusRegions: {
      display: { x: 0.3, y: 0.04, w: 0.4, h: 0.36 },
      camera: { x: 0.38, y: 0.06, w: 0.24, h: 0.2 },
      acoustics: { x: 0.22, y: 0.4, w: 0.56, h: 0.42 },
      lighting: { x: 0.1, y: 0, w: 0.8, h: 0.26 },
      network: { x: 0.34, y: 0.5, w: 0.32, h: 0.28 },
    },
  },
};

export function seedDemoAnalysisForTour(): boolean {
  return saveRoomAnalysisPayload(DEMO_TOUR_ANALYSIS);
}
