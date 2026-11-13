import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addRoomPhotos,
  lowConfidenceAngleHint,
  photoCountLine,
  replacePrimary,
  uploadTrimNotice,
} from "./roomPhotoSet";

function photo(name: string, size = 10): File {
  return new File([name], name, { type: "image/jpeg", lastModified: size });
}

describe("addRoomPhotos", () => {
  it("makes the first photo the main view and the next two angles", () => {
    const { next, ignored } = addRoomPhotos(
      { primary: null, extras: [] },
      [photo("wide.jpg"), photo("display.jpg"), photo("corner.jpg"), photo("extra.jpg")],
    );
    assert.equal(next.primary?.name, "wide.jpg");
    assert.deepEqual(
      next.extras.map((file) => file.name),
      ["display.jpg", "corner.jpg"],
    );
    assert.equal(ignored, 1);
  });

  it("keeps a photo already chosen and fills angles from a later drop", () => {
    const { next, ignored } = addRoomPhotos(
      { primary: photo("wide.jpg"), extras: [] },
      [photo("display.jpg"), photo("corner.jpg")],
    );
    assert.equal(next.primary?.name, "wide.jpg");
    assert.deepEqual(
      next.extras.map((file) => file.name),
      ["display.jpg", "corner.jpg"],
    );
    assert.equal(ignored, 0);
  });

  it("uses the first angle pick as the main photo when none is chosen yet", () => {
    const { next } = addRoomPhotos({ primary: null, extras: [] }, [photo("display.jpg")]);
    assert.equal(next.primary?.name, "display.jpg");
    assert.equal(next.extras.length, 0);
  });

  it("skips a duplicate of the main photo", () => {
    const { next, ignored } = addRoomPhotos(
      { primary: photo("wide.jpg"), extras: [] },
      [photo("wide.jpg"), photo("corner.jpg")],
    );
    assert.deepEqual(
      next.extras.map((file) => file.name),
      ["corner.jpg"],
    );
    assert.equal(ignored, 1);
  });
});

describe("replacePrimary", () => {
  it("swaps the chosen angle into the main view", () => {
    const next = replacePrimary(
      { primary: photo("wide.jpg"), extras: [photo("display.jpg")] },
      photo("display.jpg"),
    );
    assert.equal(next.primary?.name, "display.jpg");
    assert.deepEqual(
      next.extras.map((file) => file.name),
      ["wide.jpg"],
    );
  });
});

describe("upload and results copy", () => {
  it("says how many photos were sent when one was dropped", () => {
    assert.equal(uploadTrimNotice(3, 2), "Sent 2 of 3. The rest were too large.");
    assert.equal(uploadTrimNotice(1, 1), null);
  });

  it("counts the photos that were read", () => {
    assert.equal(photoCountLine(1), "Read from 1 photo");
    assert.equal(photoCountLine(3), "Read from 3 photos");
  });

  it("suggests another angle only for a low-confidence single photo", () => {
    assert.equal(lowConfidenceAngleHint(0.4, 1), "A display-wall photo would help.");
    assert.equal(lowConfidenceAngleHint(0.8, 1), null);
    assert.equal(lowConfidenceAngleHint(0.4, 2), null);
  });
});
