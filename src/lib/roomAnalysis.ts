import { z } from "zod";

export const roomAnalysisSchema = z.object({
  dimensions: z.object({
    unit: z.enum(["feet", "meters"]),
    // Use inclusive .min() — .positive() becomes JSON Schema exclusiveMinimum, which Anthropic rejects.
    length: z.number().min(0.001),
    width: z.number().min(0.001),
    height: z.number().min(0.001),
    confidence: z.number().min(0).max(1),
    reasoning: z
      .string()
      .min(1)
      .describe("Brief explanation of cues used for the estimate."),
  }),
  detectedReference: z
    .object({
      type: z
        .enum(["none", "credit-card", "a4-letter-paper", "known-ceiling-height"])
        .describe("Reference type used, if any."),
      notes: z.string().min(1),
    })
    .describe("How the model handled the reference constraint."),
  roomSummary: z.object({
    likelyUse: z
      .enum(["home", "small-office", "conference", "classroom", "unknown"])
      .describe("Best guess based on the photo."),
    occupancy: z
      .number()
      .int()
      .min(0)
      .describe("Rough seating capacity estimate if visible, else 0."),
    keyConstraints: z.array(z.string()).min(1),
  }),
  recommendations: z.object({
    camera: z.array(z.string()).min(1),
    lighting: z.array(z.string()).min(1),
    acoustics: z.array(z.string()).min(1),
    display: z.array(z.string()).min(1),
    seating: z.array(z.string()).min(1),
    cabling: z.array(z.string()).min(1),
    network: z.array(z.string()).min(1),
    power: z.array(z.string()).min(1),
  }),
  quickChecklist: z.array(z.string()).min(3),
});

export type RoomAnalysis = z.infer<typeof roomAnalysisSchema>;

export function buildWebexStyleRubric(): string {
  return [
    "Use a practical, standards-based collaboration-room mindset (camera framing, lighting, acoustics, display legibility, seating geometry, cabling, network, power).",
    "Focus on improvements that are low-cost and feasible for a typical room setup.",
    "Prefer specific recommendations (e.g. 'raise camera to eye level', 'add diffuse key light at 45°') over vague advice.",
    "When uncertain from a single photo, say what you can't see and propose a safe default.",
  ].join("\n");
}

