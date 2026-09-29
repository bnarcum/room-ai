import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_ANALYZE_PHOTOS,
  collectAnalyzePhotoBlobs,
  normalizeVisionImages,
} from "./analyzePhotos";

function img(label: string): File {
  return new File([label], `${label}.jpg`, { type: "image/jpeg" });
}

async function labels(blobs: Blob[]): Promise<string[]> {
  return Promise.all(blobs.map((blob) => blob.text()));
}

describe("collectAnalyzePhotoBlobs", () => {
  it("returns only the primary photo by default", async () => {
    const form = new FormData();
    form.set("photo", img("a"));
    const got = collectAnalyzePhotoBlobs(form);
    assert.equal(got.length, 1);
    assert.deepEqual(await labels(got), ["a"]);
  });

  it("accepts photo2 and photo3 after photo", async () => {
    const form = new FormData();
    form.set("photo", img("a"));
    form.set("photo2", img("b"));
    form.set("photo3", img("c"));
    assert.deepEqual(await labels(collectAnalyzePhotoBlobs(form)), ["a", "b", "c"]);
  });

  it("accepts repeated photos when photo is omitted", async () => {
    const form = new FormData();
    form.append("photos", img("a"));
    form.append("photos", img("b"));
    assert.deepEqual(await labels(collectAnalyzePhotoBlobs(form)), ["a", "b"]);
  });

  it("caps at three photos", () => {
    const form = new FormData();
    form.set("photo", img("a"));
    form.append("photos", img("b"));
    form.append("photos", img("c"));
    form.append("photos", img("d"));
    assert.equal(collectAnalyzePhotoBlobs(form).length, MAX_ANALYZE_PHOTOS);
  });
});

describe("normalizeVisionImages", () => {
  it("prefers the images array and keeps primary first", () => {
    const images = [
      { mediaType: "image/jpeg", imageBase64: "AAA" },
      { mediaType: "image/jpeg", imageBase64: "BBB" },
    ];
    assert.deepEqual(normalizeVisionImages({ images, mediaType: "image/png", imageBase64: "ZZZ" }), images);
  });

  it("falls back to a single mediaType + imageBase64 pair", () => {
    assert.deepEqual(normalizeVisionImages({ mediaType: "image/png", imageBase64: "QQQ" }), [
      { mediaType: "image/png", imageBase64: "QQQ" },
    ]);
  });
});
