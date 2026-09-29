import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  coerceRoomAnalysisPayload,
  parseKnownCeilingHeight,
} from "./coerceRoomAnalysis";

type Coerced = {
  dimensions: {
    height: number;
    heightMin: number;
    heightMax: number;
    unit: "feet" | "meters";
  };
  detectedReference: { type: string };
};

function asCoerced(raw: unknown): Coerced {
  return raw as Coerced;
}

function homeOffice(height: number) {
  return {
    dimensions: {
      unit: "feet" as const,
      length: 10,
      width: 12,
      height,
      heightMin: height - 0.5,
      heightMax: height + 0.5,
      confidence: 0.6,
    },
    roomSummary: {
      likelyUse: "home",
      occupancy: 1,
    },
  };
}

function conference(height: number) {
  return {
    dimensions: {
      unit: "feet" as const,
      length: 22,
      width: 16,
      height,
      heightMin: height - 0.5,
      heightMax: height + 0.5,
      confidence: 0.7,
    },
    roomSummary: {
      likelyUse: "conference",
      occupancy: 8,
    },
  };
}

describe("parseKnownCeilingHeight", () => {
  it("parses a bare number in the fallback unit", () => {
    assert.equal(parseKnownCeilingHeight("10", "feet"), 10);
  });

  it("parses '10 ft' and '10ft'", () => {
    assert.equal(parseKnownCeilingHeight("10 ft", "feet"), 10);
    assert.equal(parseKnownCeilingHeight("10ft", "feet"), 10);
  });

  it("parses '3 m' into feet or meters", () => {
    assert.equal(parseKnownCeilingHeight("3 m", "meters"), 3);
    assert.ok(
      Math.abs((parseKnownCeilingHeight("3 m", "feet") ?? 0) - 3 * 3.28084) < 0.001,
    );
  });

  it("rejects empty or non-numeric input", () => {
    assert.equal(parseKnownCeilingHeight("", "feet"), undefined);
    assert.equal(parseKnownCeilingHeight("abc", "feet"), undefined);
  });
});

describe("coerceRoomAnalysisPayload known ceiling", () => {
  it("home office + known 10 ft keeps height 10", () => {
    const out = asCoerced(
      coerceRoomAnalysisPayload(homeOffice(8), {
        knownCeilingHeight: 10,
        unit: "feet",
      }),
    );
    assert.equal(out.dimensions.height, 10);
    assert.equal(out.dimensions.heightMin, 10);
    assert.equal(out.dimensions.heightMax, 10);
    assert.equal(out.detectedReference.type, "known-ceiling-height");
  });

  it("home office + no known + model 10 is still capped at 9", () => {
    const out = asCoerced(coerceRoomAnalysisPayload(homeOffice(10)));
    assert.equal(out.dimensions.height, 9);
    assert.ok(out.dimensions.heightMax <= 9);
  });

  it("conference + known 12 keeps height 12", () => {
    const out = asCoerced(
      coerceRoomAnalysisPayload(conference(9), {
        knownCeilingHeight: 12,
        unit: "feet",
      }),
    );
    assert.equal(out.dimensions.height, 12);
    assert.equal(out.dimensions.heightMin, 12);
    assert.equal(out.dimensions.heightMax, 12);
    assert.equal(out.detectedReference.type, "known-ceiling-height");
  });

  it("does not recap a stored known-ceiling-height of 10 ft", () => {
    const first = coerceRoomAnalysisPayload(homeOffice(10), {
      knownCeilingHeight: 10,
      unit: "feet",
    });
    const again = asCoerced(coerceRoomAnalysisPayload(first));
    assert.equal(again.dimensions.height, 10);
    assert.equal(again.detectedReference.type, "known-ceiling-height");
  });
});
