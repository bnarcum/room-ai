import {
  effectiveDesignerSeatCount,
  heuristicSeatCountFromDims as sharedHeuristicSeatCountFromDims,
  isPersonalWorkspace,
  personalWorkspaceSeatCount,
  pickRoomLayoutKind,
  type RoomLayoutKind,
} from "webex-designer-export";

export { isPersonalWorkspace, personalWorkspaceSeatCount };

import type { RoomAnalysis } from "@/lib/roomAnalysis";

const FT_PER_M = 3.28084;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function toFeet(value: number, unit: "feet" | "meters"): number {
  return unit === "meters" ? value * FT_PER_M : value;
}

export function rangeFromMidpoint(
  mid: number,
  confidence: number,
): { min: number; max: number } {
  const c = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.45;
  const spread = 0.08 + (1 - c) * 0.16;
  const min = round1(Math.max(0.5, mid * (1 - spread)));
  const max = round1(Math.max(min + 0.2, mid * (1 + spread)));
  return { min, max };
}

export function midpointFromRange(min: number, max: number): number {
  return round1((min + max) / 2);
}

export function formatAxisRange(
  min: number,
  max: number,
  unit: "feet" | "meters",
): string {
  const suffix = unit === "meters" ? "m" : "ft";
  if (Math.abs(max - min) < 0.15) {
    return `${round1(min)} ${suffix}`;
  }
  return `${round1(min)}–${round1(max)} ${suffix}`;
}

export function formatDirectionalSize(analysis: RoomAnalysis): string {
  const d = analysis.dimensions;
  return [
    formatAxisRange(d.lengthMin, d.lengthMax, d.unit),
    formatAxisRange(d.widthMin, d.widthMax, d.unit),
    formatAxisRange(d.heightMin, d.heightMax, d.unit),
  ].join(" × ");
}

export function likelyUseHeadline(likelyUse: string): string {
  switch (likelyUse) {
    case "home":
    case "small-office":
      return "Home office";
    case "conference":
      return "Conference";
    case "classroom":
      return "Classroom";
    default:
      return "Meeting room";
  }
}

export function snapRoomTitle(likelyUse: string): string {
  return `SnapRoom — ${likelyUseHeadline(likelyUse)}`;
}

export function likelyUseLabel(likelyUse: string): string {
  return likelyUseHeadline(likelyUse);
}

export function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(?:\s|$)/);
  return (m ? m[1] : t).trim();
}

function formatAxisRangeBare(min: number, max: number): string {
  if (Math.abs(max - min) < 0.15) {
    return `${round1(min)}`;
  }
  return `${round1(min)}–${round1(max)}`;
}

export function formatPlanSize(analysis: RoomAnalysis): string {
  const d = analysis.dimensions;
  const suffix = d.unit === "meters" ? "m" : "ft";
  return `${formatAxisRangeBare(d.lengthMin, d.lengthMax)} × ${formatAxisRangeBare(d.widthMin, d.widthMax)} ${suffix}`;
}

export function formatAboutPlanSize(analysis: RoomAnalysis): string {
  const d = analysis.dimensions;
  const suffix = d.unit === "meters" ? "m" : "ft";
  return `about ${Math.round(d.length)} × ${Math.round(d.width)} ${suffix}`;
}

export function resultsHeadlineTitle(analysis: RoomAnalysis): string {
  return likelyUseHeadline(analysis.roomSummary.likelyUse);
}

export function resultsHeadlineMeta(analysis: RoomAnalysis): string {
  const seats = effectiveSeatCount(analysis);
  const seatWord = seats === 1 ? "seat" : "seats";
  return `${seats} ${seatWord} · ${formatAboutPlanSize(analysis)}`;
}

export function resultsHeadline(analysis: RoomAnalysis): string {
  return `${resultsHeadlineTitle(analysis)} · ${resultsHeadlineMeta(analysis)}`;
}

export function layoutKindLabel(kind: RoomLayoutKind): string {
  switch (kind) {
    case "huddle":
      return "Huddle";
    case "small":
      return "Small";
    case "medium":
      return "Medium";
    case "large":
      return "Large";
    case "boardroom":
      return "Boardroom";
  }
}

export function heuristicSeatCountFromDims(
  width: number,
  length: number,
  unit: "feet" | "meters",
): number {
  return sharedHeuristicSeatCountFromDims(width, length, unit);
}

export function effectiveSeatCount(analysis: RoomAnalysis): number {
  const d = analysis.dimensions;
  const likelyUse = analysis.roomSummary.likelyUse;
  if (isPersonalWorkspace(likelyUse)) {
    return personalWorkspaceSeatCount(analysis.roomSummary.occupancy);
  }
  return effectiveDesignerSeatCount({
    occupancy: analysis.roomSummary.occupancy,
    width: d.width,
    length: d.length,
    unit: d.unit,
    likelyUse,
  });
}

/** Workspace Designer deep-link chair count (huddle ch=2 for home / small-office). */
export function designerSeatCount(analysis: RoomAnalysis): number {
  const d = analysis.dimensions;
  return effectiveDesignerSeatCount({
    occupancy: analysis.roomSummary.occupancy,
    width: d.width,
    length: d.length,
    unit: d.unit,
    likelyUse: analysis.roomSummary.likelyUse,
  });
}

export function layoutKindFromAnalysis(analysis: RoomAnalysis): RoomLayoutKind {
  if (isPersonalWorkspace(analysis.roomSummary.likelyUse)) {
    return "huddle";
  }
  return pickRoomLayoutKind(designerSeatCount(analysis));
}

/** Home / small-office ceilings stay ~8–9 ft even if the model said 10. */
export function capPersonalWorkspaceHeight(
  unit: "feet" | "meters",
  mid: number,
  min: number,
  max: number,
): { mid: number; min: number; max: number } {
  const cap = unit === "meters" ? 2.74 : 9;
  const floor = unit === "meters" ? 2.44 : 8;
  if (!(max > cap) && !(mid > cap)) {
    return { mid, min, max };
  }
  const nextMax = Math.min(max, cap);
  let nextMin = Math.min(min, nextMax);
  if (nextMin > cap) nextMin = floor;
  let nextMid = Math.min(mid, cap);
  if (nextMid < nextMin || nextMid > nextMax) {
    nextMid = midpointFromRange(nextMin, nextMax);
  }
  return { mid: nextMid, min: nextMin, max: nextMax };
}

export function inferScreenDiagonalInches(analysis: {
  dimensions: { length: number; width: number; unit: "feet" | "meters" };
  roomSummary: { primaryScreenDiagonalInches?: number };
  layoutKind?: RoomLayoutKind;
}): number {
  const raw = analysis.roomSummary.primaryScreenDiagonalInches;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 32 && raw <= 120) {
    return Math.round(raw);
  }
  const kind =
    analysis.layoutKind ??
    pickRoomLayoutKind(
      heuristicSeatCountFromDims(
        analysis.dimensions.width,
        analysis.dimensions.length,
        analysis.dimensions.unit,
      ),
    );
  const spanFt = Math.max(
    toFeet(analysis.dimensions.length, analysis.dimensions.unit),
    toFeet(analysis.dimensions.width, analysis.dimensions.unit),
  );
  switch (kind) {
    case "huddle":
      return spanFt >= 14 ? 50 : 43;
    case "small":
      return spanFt >= 18 ? 65 : 55;
    case "medium":
      return spanFt >= 22 ? 75 : 65;
    case "large":
      return spanFt >= 28 ? 85 : 75;
    case "boardroom":
      return spanFt >= 30 ? 85 : 75;
  }
}
