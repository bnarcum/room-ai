import { z } from "zod";

import { buildWebexDesignerResourcesRubricSection } from "@/lib/webexDesignerResources";

export type LikelyUseCategory =
  | "home"
  | "small-office"
  | "conference"
  | "classroom"
  | "unknown";

export type DetectedReferenceType =
  | "none"
  | "door"
  | "table"
  | "chair"
  | "ceiling"
  | "credit-card"
  | "a4-letter-paper"
  | "known-ceiling-height";

/** Maps free-form model labels to our canonical categories (structured output enums are brittle). */
export function normalizeLikelyUse(raw: string): LikelyUseCategory {
  const k = raw.toLowerCase().trim().replace(/\s+/g, "-");
  const aliases: Record<string, LikelyUseCategory> = {
    home: "home",
    "home-office": "small-office",
    homeoffice: "small-office",
    "small-office": "small-office",
    smalloffice: "small-office",
    office: "small-office",
    "personal-office": "small-office",
    workspace: "small-office",
    den: "home",
    study: "home",
    conference: "conference",
    classroom: "classroom",
    unknown: "unknown",
  };
  return aliases[k] ?? "unknown";
}

function normalizeDetectedReferenceType(raw: string): DetectedReferenceType {
  const k = raw.toLowerCase().trim().replace(/\s+/g, "-");
  switch (k) {
    case "none":
      return "none";
    case "door":
    case "doorway":
      return "door";
    case "table":
    case "conference-table":
      return "table";
    case "chair":
    case "task-chair":
      return "chair";
    case "ceiling":
    case "ceiling-tile":
      return "ceiling";
    case "credit-card":
      return "credit-card";
    case "a4-letter-paper":
      return "a4-letter-paper";
    case "known-ceiling-height":
      return "known-ceiling-height";
    default:
      return "none";
  }
}

/**
 * Schema sent to the model / JSON Schema. Anthropic structured output rejects
 * numeric `minimum`, `maximum`, and `exclusiveMinimum` in many cases — use plain
 * `z.number()` here and enforce ranges in `roomAnalysisSchema` below.
 *
 * Use `z.string()` for categorical fields that models often alias; we normalize
 * to strict unions in `roomAnalysisSchema`.
 */
export const roomAnalysisOutputSchema = z.object({
  dimensions: z.object({
    unit: z.enum(["feet", "meters"]),
    length: z
      .number()
      .describe("Midpoint room length in the chosen unit (export midpoint)."),
    width: z
      .number()
      .describe("Midpoint room width in the chosen unit (export midpoint)."),
    height: z
      .number()
      .describe("Midpoint room height in the chosen unit (export midpoint)."),
    lengthMin: z
      .number()
      .describe("Lower bound for length; prefer a range over a single number."),
    lengthMax: z
      .number()
      .describe("Upper bound for length; prefer a range over a single number."),
    widthMin: z
      .number()
      .describe("Lower bound for width."),
    widthMax: z
      .number()
      .describe("Upper bound for width."),
    heightMin: z
      .number()
      .describe("Lower bound for height."),
    heightMax: z
      .number()
      .describe("Upper bound for height."),
    confidence: z
      .number()
      .describe("Confidence between 0 and 1 for the dimension estimates."),
    reasoning: z
      .string()
      .describe(
        "Brief explanation of reference objects used (door, table, chair, ceiling, known height).",
      ),
  }),
  detectedReference: z
    .object({
      type: z
        .string()
        .describe(
          "Primary scale cue: none, door, table, chair, ceiling, known-ceiling-height, credit-card, or a4-letter-paper.",
        ),
      notes: z.string().describe("How the model handled the reference constraint."),
    })
    .describe("How the model handled the reference constraint."),
  roomSummary: z.object({
    likelyUse: z
      .string()
      .describe(
        "Room category: home, small-office, conference, classroom, or unknown (home-office maps to small-office).",
      ),
    occupancy: z
      .number()
      .describe(
        "Rough seating capacity if visible in the photo; use 0 if unknown (integer preferred)."
      ),
    primaryScreenDiagonalInches: z
      .number()
      .describe(
        "Best estimate of the main collaboration display diagonal in inches (e.g. 43, 55, 65, 75, 85). Infer from room size if none is visible.",
      ),
    screenCount: z
      .number()
      .describe(
        "Count of wall-mounted or freestanding meeting displays (0 if none visible).",
      ),
    keyConstraints: z.array(z.string()).describe("At least one constraint."),
  }),
  observedItems: z
    .object({
      electronicsAndDevices: z
        .array(z.string())
        .describe(
          "Tech visible in the photo: laptops, monitors, phones, cameras, speakers, codecs, etc. Empty array if none.",
        ),
      plantsAndDecor: z
        .array(z.string())
        .describe(
          "Plants, artwork, rugs, curtains, lamps, accessories. Empty array if none.",
        ),
      otherNotable: z
        .array(z.string())
        .describe(
          "Other notable objects: whiteboards, bookshelves, beverage stations, storage. Empty array if none.",
        ),
    })
    .default({
      electronicsAndDevices: [],
      plantsAndDecor: [],
      otherNotable: [],
    }),
  recommendations: z.object({
    camera: z.array(z.string()),
    lighting: z.array(z.string()),
    acoustics: z.array(z.string()),
    display: z.array(z.string()),
    seating: z.array(z.string()),
    cabling: z.array(z.string()),
    network: z.array(z.string()),
    power: z.array(z.string()),
  }),
  quickChecklist: z.array(z.string()),
});

/** Runtime validation after the model responds (ranges, non-empty strings, array sizes). */
export const roomAnalysisSchema = roomAnalysisOutputSchema
  .transform((data) => ({
    ...data,
    detectedReference: {
      ...data.detectedReference,
      type: normalizeDetectedReferenceType(data.detectedReference.type),
    },
    roomSummary: {
      ...data.roomSummary,
      likelyUse: normalizeLikelyUse(data.roomSummary.likelyUse),
      occupancy: (() => {
        const o = Number(data.roomSummary.occupancy);
        if (!Number.isFinite(o)) return 0;
        return Math.max(0, Math.round(o));
      })(),
      primaryScreenDiagonalInches: (() => {
        const n = Number(data.roomSummary.primaryScreenDiagonalInches);
        if (!Number.isFinite(n)) return 55;
        return Math.max(32, Math.min(120, Math.round(n)));
      })(),
      screenCount: (() => {
        const n = Number(data.roomSummary.screenCount);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(8, Math.round(n)));
      })(),
    },
  }))
  .superRefine((data, ctx) => {
    const { dimensions } = data;
    if (dimensions.length < 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "length must be positive",
        path: ["dimensions", "length"],
      });
    }
    if (dimensions.width < 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "width must be positive",
        path: ["dimensions", "width"],
      });
    }
    if (dimensions.height < 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "height must be positive",
        path: ["dimensions", "height"],
      });
    }
    const rangePairs = [
      ["length", dimensions.lengthMin, dimensions.lengthMax],
      ["width", dimensions.widthMin, dimensions.widthMax],
      ["height", dimensions.heightMin, dimensions.heightMax],
    ] as const;
    for (const [axis, min, max] of rangePairs) {
      if (!(min > 0) || !(max > 0) || min > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${axis} range must be positive with min ≤ max`,
          path: ["dimensions", `${axis}Min`],
        });
      }
    }
    const conf = dimensions.confidence;
    if (Number.isNaN(conf) || conf < 0 || conf > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "confidence must be between 0 and 1",
        path: ["dimensions", "confidence"],
      });
    }
    if (!dimensions.reasoning.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reasoning must not be empty",
        path: ["dimensions", "reasoning"],
      });
    }

    if (!data.detectedReference.notes.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "notes must not be empty",
        path: ["detectedReference", "notes"],
      });
    }

    const occ = data.roomSummary.occupancy;
    if (!Number.isInteger(occ) || occ < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "occupancy must be a non-negative integer",
        path: ["roomSummary", "occupancy"],
      });
    }

    if (data.roomSummary.keyConstraints.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "at least one key constraint required",
        path: ["roomSummary", "keyConstraints"],
      });
    }

    const rec = data.recommendations;
    const categories = [
      ["camera", rec.camera],
      ["lighting", rec.lighting],
      ["acoustics", rec.acoustics],
      ["display", rec.display],
      ["seating", rec.seating],
      ["cabling", rec.cabling],
      ["network", rec.network],
      ["power", rec.power],
    ] as const;
    for (const [key, arr] of categories) {
      if (arr.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "at least one recommendation required",
          path: ["recommendations", key],
        });
      }
    }

    if (data.quickChecklist.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "at least three checklist items required",
        path: ["quickChecklist"],
      });
    }
  }
);

export type RoomAnalysis = z.infer<typeof roomAnalysisSchema>;

export function buildWebexStyleRubric(): string {
  return [
    "Use a practical, standards-based collaboration-room mindset (camera framing, lighting, acoustics, display legibility, seating geometry, cabling, network, power).",
    "Focus on improvements that are low-cost and feasible for a typical room setup.",
    "Prefer specific recommendations (e.g. 'raise camera to eye level', 'add diffuse key light at 45°') over vague advice.",
    "When uncertain from a single photo, say what you can't see and propose a safe default.",
    "Populate observedItems from what is actually visible (laptops on tables, wall-mounted displays, potted plants, decor). When you mention those same items in recommendations or checklist, keep wording consistent.",
    "",
    buildWebexDesignerResourcesRubricSection(),
  ].join("\n");
}
