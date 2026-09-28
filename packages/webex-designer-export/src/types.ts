/**
 * Minimal SnapRoom (room analysis) shape needed to build a Workspace Designer
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
  /** home / small-office drive huddle + 1–2 seats; conference / classroom use area seats */
  likelyUse: string;
  /** Visible chairs; home office is 1–2, never an area-derived boardroom count */
  occupancy: number;
  /** Best-effort primary display diagonal; used instead of a boardroom default. */
  primaryScreenDiagonalInches?: number;
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
