import type { RoomAnalysis } from "@/lib/roomAnalysis";
import { saveRoomAnalysisPayload } from "@/lib/resultStorage";

export type DemoAnalysisEnvelope = {
  ok: true;
  meta: { provider: string; model: string };
  data: RoomAnalysis;
};

/** Static results for the guided tour — no API call required. */
export const DEMO_TOUR_ANALYSIS: DemoAnalysisEnvelope = {
  ok: true,
  meta: { provider: "demo", model: "snaproom-tour-fixture" },
  data: {
    dimensions: {
      unit: "feet",
      length: 18,
      width: 12,
      height: 9,
      confidence: 0.72,
      reasoning:
        "Estimated from visible wall spans and ceiling line in a typical huddle room.",
    },
    detectedReference: {
      type: "none",
      notes: "No scale reference visible; estimates are directional.",
    },
    roomSummary: {
      likelyUse: "conference",
      occupancy: 6,
      keyConstraints: [
        "Window glare on display wall",
        "Limited ceiling height for pendant mic",
      ],
    },
    observedItems: {
      electronicsAndDevices: ["Wall-mounted display", "Laptop on table"],
      plantsAndDecor: ["Potted plant near window"],
      otherNotable: ["Whiteboard"],
    },
    recommendations: {
      camera: ["Mount camera at eye level, centered on the table."],
      lighting: ["Add diffuse front fill to reduce harsh window backlight."],
      acoustics: ["Add soft surfaces to reduce flutter echo."],
      display: ["Confirm 65–75\" display for 6-seat geometry."],
      seating: ["Keep camera-facing seats within 8 ft for framing."],
      cabling: ["Route HDMI/USB under table with cable tray."],
      network: ["Dedicated VLAN for collaboration endpoints."],
      power: ["Add floor box outlets at table center."],
    },
    quickChecklist: [
      "Verify camera sightlines from primary seats",
      "Check display glare from windows",
      "Confirm network drop at table",
    ],
  },
};

export function seedDemoAnalysisForTour(): boolean {
  return saveRoomAnalysisPayload(DEMO_TOUR_ANALYSIS);
}
