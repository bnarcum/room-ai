/**
 * Builds a Workspace Designer “room summary” deep link (hash router).
 * Shape matches user-provided examples, e.g.
 * `https://designer.webex.com/#/room/largeroom/summary?1&rt=Large%20room&ch=16`
 *
 * Slugs align with the public meeting-room presets (Huddle → Executive boardroom).
 */
export {
  clampDesignerSeatCount,
  pickRoomLayoutKind,
  pickWebexRoomTier,
  type RoomLayoutKind,
  type WebexRoomTier,
} from "webex-designer-export";

import {
  clampDesignerSeatCount,
  pickWebexRoomTier,
} from "webex-designer-export";

export function buildWebexDesignerSummaryUrl(seatCount: number): string {
  const ch = clampDesignerSeatCount(seatCount);
  const { pathSlug, roomTypeLabel } = pickWebexRoomTier(ch);
  const rt = encodeURIComponent(roomTypeLabel);
  return `https://designer.webex.com/#/room/${pathSlug}/summary?1&rt=${rt}&ch=${ch}`;
}
