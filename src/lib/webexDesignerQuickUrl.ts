/**
 * Builds a Workspace Designer “room summary” deep link (hash router).
 * Shape matches user-provided examples, e.g.
 * `https://designer.webex.com/#/room/largeroom/summary?1&rt=Large%20room&ch=16`
 *
 * Slugs align with the public meeting-room presets (Huddle → Executive boardroom).
 */
export type WebexRoomTier = {
  pathSlug: string;
  /** Value for the `rt` query param (Workspace Designer shows this label). */
  roomTypeLabel: string;
};

export function pickWebexRoomTier(seatCount: number): WebexRoomTier {
  const n = Math.max(2, Math.min(36, Math.round(seatCount)));

  if (n <= 4) {
    return { pathSlug: "huddleroom", roomTypeLabel: "Huddle Room" };
  }
  if (n <= 8) {
    return { pathSlug: "smallroom", roomTypeLabel: "Small Room" };
  }
  if (n <= 14) {
    return { pathSlug: "mediumroom", roomTypeLabel: "Medium Room" };
  }
  if (n <= 22) {
    // Matches Cisco example: Large room + largeroom slug
    return { pathSlug: "largeroom", roomTypeLabel: "Large room" };
  }
  return {
    pathSlug: "executiveboardroom",
    roomTypeLabel: "Executive Boardroom",
  };
}

export function buildWebexDesignerSummaryUrl(seatCount: number): string {
  const ch = Math.max(2, Math.min(36, Math.round(seatCount)));
  const { pathSlug, roomTypeLabel } = pickWebexRoomTier(ch);
  const rt = encodeURIComponent(roomTypeLabel);
  return `https://designer.webex.com/#/room/${pathSlug}/summary?1&rt=${rt}&ch=${ch}`;
}
