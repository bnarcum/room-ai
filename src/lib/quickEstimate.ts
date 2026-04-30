import { z } from "zod";

/**
 * Minimal vision output for Workspace Designer deep links — seating and displays only.
 */
export const quickEstimateOutputSchema = z.object({
  seatCount: z
    .number()
    .describe(
      "Estimated number of seats/chairs suitable for this meeting space (visible chairs + reasonable capacity for the table/floor area). Integer.",
    ),
  screenCount: z
    .number()
    .describe(
      "Count of primary wall-mounted or freestanding displays/projector screens clearly serving the meeting area (0 if none visible).",
    ),
  primaryScreenDiagonalInches: z
    .number()
    .describe(
      "Best estimate of the main collaboration display diagonal in inches (e.g. 55, 65, 75). If unclear, infer from room size.",
    ),
  notes: z
    .string()
    .describe(
      "One short sentence on confidence limits (occlusions, angle, partial view).",
    ),
});

export const quickEstimateSchema = quickEstimateOutputSchema.transform((d) => ({
  seatCount: Math.max(2, Math.min(36, Math.round(Number(d.seatCount)) || 8)),
  screenCount: Math.max(0, Math.min(8, Math.round(Number(d.screenCount)) || 0)),
  primaryScreenDiagonalInches: Math.max(
    32,
    Math.min(120, Math.round(Number(d.primaryScreenDiagonalInches)) || 65),
  ),
  notes: d.notes.trim() || "Estimate from a single photo; verify on site.",
}));

export type QuickEstimate = z.infer<typeof quickEstimateSchema>;
