/**
 * Minimal Room Vision / room-ai analysis shape needed to build a Workspace Designer
 * custom room. Keeps this package free of zod/next dependencies.
 *
 * @see https://designer.webex.com/#/article/CustomRooms
 */
export type RoomDimensionsInput = {
  unit: "feet" | "meters";
  length: number;
  width: number;
  height: number;
};

export type RoomSummaryInput = {
  /** e.g. conference | home — used in the room title only */
  likelyUse: string;
  /** Hint for chair count (clamped in the builder) */
  occupancy: number;
};

export type RoomAnalysisForWebex = {
  dimensions: RoomDimensionsInput;
  roomSummary: RoomSummaryInput;
};

/** Workspace Designer custom room document (subset of full schema). */
export type WebexDesignerRoomJson = {
  title: string;
  roomShape: {
    manual: true;
    /** meters — span along room x */
    width: number;
    /** meters — span along room z */
    length: number;
    /** meters */
    height: number;
  };
  customObjects: Record<string, unknown>[];
};

export type BuildWebexDesignerRoomOptions = {
  /** Override generated title */
  title?: string;
};
