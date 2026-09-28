/**
 * Shared seating → Workspace Designer preset mapping.
 * Keep these thresholds in lockstep with designer.webex.com room slugs.
 */
export type RoomLayoutKind =
  | "huddle"
  | "small"
  | "medium"
  | "large"
  | "boardroom";

export type WebexRoomTier = {
  pathSlug: string;
  /** Value for the `rt` query param (Workspace Designer shows this label). */
  roomTypeLabel: string;
  layoutKind: RoomLayoutKind;
};

const FT_PER_M = 3.28084;
/** ~28 ft² per seat — 12×14 ft ≈ 6 seats. */
const SQFT_PER_SEAT = 28;
/** 12×12 ft and up is a small/medium room, never a huddle preset. */
const SMALL_ROOM_MIN_AREA_FT = 144;
const SMALL_ROOM_MIN_SEATS = 5;

export function clampDesignerSeatCount(seatCount: number): number {
  return Math.max(2, Math.min(36, Math.round(seatCount)));
}

export function areaSquareFeet(
  width: number,
  length: number,
  unit: "feet" | "meters",
): number {
  const w = unit === "meters" ? width * FT_PER_M : width;
  const l = unit === "meters" ? length * FT_PER_M : length;
  return w * l;
}

export function heuristicSeatCountFromDims(
  width: number,
  length: number,
  unit: "feet" | "meters",
): number {
  return clampDesignerSeatCount(
    Math.round(areaSquareFeet(width, length, unit) / SQFT_PER_SEAT),
  );
}

/**
 * Seats = max(visible occupancy, L×W area heuristic).
 * Rooms that are clearly small/medium by area never drop to huddle.
 */
export function effectiveDesignerSeatCount(input: {
  occupancy: number;
  width: number;
  length: number;
  unit: "feet" | "meters";
}): number {
  const areaSeats = heuristicSeatCountFromDims(input.width, input.length, input.unit);
  const visible =
    Number.isFinite(input.occupancy) && input.occupancy > 0
      ? Math.round(input.occupancy)
      : 0;
  let seats = Math.max(visible, areaSeats);
  if (
    areaSquareFeet(input.width, input.length, input.unit) >= SMALL_ROOM_MIN_AREA_FT &&
    seats < SMALL_ROOM_MIN_SEATS
  ) {
    seats = SMALL_ROOM_MIN_SEATS;
  }
  return clampDesignerSeatCount(seats);
}

export function pickRoomLayoutKind(seatCount: number): RoomLayoutKind {
  return pickWebexRoomTier(seatCount).layoutKind;
}

export function pickWebexRoomTier(seatCount: number): WebexRoomTier {
  const n = clampDesignerSeatCount(seatCount);

  if (n <= 4) {
    return {
      pathSlug: "huddleroom",
      roomTypeLabel: "Huddle Room",
      layoutKind: "huddle",
    };
  }
  if (n <= 8) {
    return {
      pathSlug: "smallroom",
      roomTypeLabel: "Small Room",
      layoutKind: "small",
    };
  }
  if (n <= 14) {
    return {
      pathSlug: "mediumroom",
      roomTypeLabel: "Medium Room",
      layoutKind: "medium",
    };
  }
  if (n <= 22) {
    return {
      pathSlug: "largeroom",
      roomTypeLabel: "Large room",
      layoutKind: "large",
    };
  }
  return {
    pathSlug: "executiveboardroom",
    roomTypeLabel: "Executive Boardroom",
    layoutKind: "boardroom",
  };
}
