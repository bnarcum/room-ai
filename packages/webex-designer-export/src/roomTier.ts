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

export function clampDesignerSeatCount(seatCount: number): number {
  return Math.max(2, Math.min(36, Math.round(seatCount)));
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
