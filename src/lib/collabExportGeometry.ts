import { isPersonalWorkspace, type RoomLayoutKind } from "webex-designer-export";

import type { RoomAnalysis } from "@/lib/roomAnalysis";
import {
  effectiveSeatCount,
  inferScreenDiagonalInches,
  layoutKindFromAnalysis,
  toFeet,
} from "@/lib/roomSizing";

const FT_PER_M = 3.28084;

export type CollabVideoDevice = {
  id: "roomBar" | "roomBarPro";
  label: "Room Bar" | "Room Bar Pro";
};

export type CollabExportGeometry = {
  tableWidth: number;
  tableLength: number;
  tvDiag: number;
  device: CollabVideoDevice;
  distDisplayToTable: number;
  frntWallToTv: number;
  drpTvNum: number;
  layoutKind: RoomLayoutKind;
  seatCount: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fromFeet(valueFt: number, unit: "feet" | "meters"): number {
  return unit === "meters" ? valueFt / FT_PER_M : valueFt;
}

export function pickCollabVideoDevice(_kind?: RoomLayoutKind): CollabVideoDevice {
  // roomBar exists in VRC, but SnapRoom pins Room Bar Pro until a huddle
  // catalog path is explicitly verified for every import build.
  return { id: "roomBarPro", label: "Room Bar Pro" };
}

/**
 * Table, display, and device for Collab Experience — derived from seats,
 * room ranges/midpoints, screen estimate, and room type. Not a fixed 4×10 / 65".
 */
export function deriveCollabExportGeometry(
  analysis: RoomAnalysis,
): CollabExportGeometry {
  const d = analysis.dimensions;
  const unit = d.unit === "meters" ? "meters" : "feet";
  const personal = isPersonalWorkspace(analysis.roomSummary.likelyUse);
  const seatCount = effectiveSeatCount(analysis);
  const layoutKind = layoutKindFromAnalysis(analysis);
  const device = pickCollabVideoDevice(layoutKind);
  const tvDiag = inferScreenDiagonalInches({
    dimensions: d,
    roomSummary: analysis.roomSummary,
    layoutKind,
  });

  const roomWidthFt = Math.max(toFeet(d.width, unit), 6);
  const roomLengthFt = Math.max(toFeet(d.length, unit), 6);

  const frntWallToTvFt = layoutKind === "huddle" ? 0.4 : 0.5;
  const rearAisleFt = personal ? 2.4 : layoutKind === "huddle" ? 2.2 : 3;
  const minDisplayGapFt = personal
    ? 2.6
    : layoutKind === "huddle"
      ? 2.4
      : layoutKind === "small"
        ? 3
        : 3.5;

  let tableWidthFt: number;
  let tableLengthFt: number;
  if (personal) {
    tableWidthFt = Math.min(3.5, Math.max(3, roomWidthFt * 0.28));
    tableLengthFt = Math.min(5, Math.max(4, roomLengthFt * 0.36));
  } else if (layoutKind === "huddle") {
    tableWidthFt = Math.min(3.4, roomWidthFt * 0.42);
    tableLengthFt = Math.min(5, Math.max(3.2, seatCount * 1.1));
  } else if (layoutKind === "small") {
    tableWidthFt = Math.min(4, roomWidthFt * 0.4);
    tableLengthFt = Math.min(roomLengthFt * 0.55, Math.max(5, (seatCount / 2) * 2.1));
  } else if (layoutKind === "medium") {
    tableWidthFt = Math.min(4.5, roomWidthFt * 0.38);
    tableLengthFt = Math.min(roomLengthFt * 0.62, Math.max(8, (seatCount / 2) * 2.2));
  } else if (layoutKind === "large") {
    tableWidthFt = Math.min(5, roomWidthFt * 0.36);
    tableLengthFt = Math.min(roomLengthFt * 0.68, Math.max(12, (seatCount / 2) * 2.25));
  } else {
    tableWidthFt = Math.min(5.5, roomWidthFt * 0.34);
    tableLengthFt = Math.min(roomLengthFt * 0.72, Math.max(14, (seatCount / 2) * 2.3));
  }

  tableWidthFt = Math.max(2.4, Math.min(tableWidthFt, roomWidthFt - 2.4));
  const maxTableLengthFt = Math.max(
    3,
    roomLengthFt - frntWallToTvFt - minDisplayGapFt - rearAisleFt,
  );
  tableLengthFt = Math.max(3, Math.min(tableLengthFt, maxTableLengthFt));

  const leftoverFt = roomLengthFt - tableLengthFt - frntWallToTvFt - rearAisleFt;
  const distDisplayToTableFt = Math.max(
    minDisplayGapFt,
    Math.min(layoutKind === "boardroom" ? 8 : 6, leftoverFt),
  );

  return {
    tableWidth: round2(fromFeet(tableWidthFt, unit)),
    tableLength: round2(fromFeet(tableLengthFt, unit)),
    tvDiag,
    device,
    distDisplayToTable: round2(fromFeet(distDisplayToTableFt, unit)),
    frntWallToTv: round2(fromFeet(frntWallToTvFt, unit)),
    drpTvNum: personal
      ? 1
      : Math.max(1, Math.min(3, analysis.roomSummary.screenCount || 1)),
    layoutKind,
    seatCount,
  };
}
