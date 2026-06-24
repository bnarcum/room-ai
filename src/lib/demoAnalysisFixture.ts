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
      confidence: 0.74,
      reasoning:
        "Scaled from the long conference table, chair spacing, and wall-to-window proportions in the isometric view.",
    },
    detectedReference: {
      type: "none",
      notes:
        "No card or paper reference visible; geometry inferred from furniture layout.",
    },
    roomSummary: {
      likelyUse: "conference",
      occupancy: 13,
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
      ],
      lighting: [
        "Add diffuse fill on the table to balance bright window light from the garden side.",
      ],
      acoustics: [
        "Consider absorptive panels on the display wall to tame reflections off glass and hard surfaces.",
      ],
      display: [
        "Current large-format display suits the table length; confirm 4K legibility from the far seats.",
      ],
      seating: [
        "Thirteen seats fit the table; reserve camera-forward positions for active speakers.",
      ],
      cabling: [
        "Route table HDMI/USB through a center cable tray to avoid laptop dongle clutter.",
      ],
      network: [
        "Place a wired drop at the table center for Room Bar or codec connectivity.",
      ],
      power: [
        "Add in-table power modules so laptops do not rely on floor cords crossing walkways.",
      ],
    },
    quickChecklist: [
      "Check display glare from the garden window during midday",
      "Confirm camera coverage for all thirteen seats",
      "Verify network and power at the table center",
    ],
  },
};

export function seedDemoAnalysisForTour(): boolean {
  return saveRoomAnalysisPayload(DEMO_TOUR_ANALYSIS);
}
