/** How home and the wizard turn picked files into one main photo plus up to two angles. */

export type RoomPhotoSet = {
  primary: File | null;
  extras: File[];
};

const MAX_EXTRAS = 2;

export function isRoomImage(file: File): boolean {
  return file.type.startsWith("image/") || file.type === "";
}

function samePhoto(a: File, b: File): boolean {
  return (
    a === b ||
    (a.name === b.name && a.size === b.size && a.lastModified === b.lastModified)
  );
}

function hasPhoto(primary: File | null, extras: File[], file: File): boolean {
  if (primary && samePhoto(primary, file)) return true;
  return extras.some((extra) => samePhoto(extra, file));
}

/** First new photo becomes the main view. Later photos fill angles, up to three total. */
export function addRoomPhotos(
  current: RoomPhotoSet,
  incoming: File[],
): { next: RoomPhotoSet; ignored: number } {
  let primary = current.primary;
  const extras = [...current.extras];
  let ignored = 0;

  for (const file of incoming) {
    if (!isRoomImage(file)) {
      ignored += 1;
      continue;
    }
    if (hasPhoto(primary, extras, file)) {
      ignored += 1;
      continue;
    }
    if (!primary) {
      primary = file;
      continue;
    }
    if (extras.length < MAX_EXTRAS) {
      extras.push(file);
      continue;
    }
    ignored += 1;
  }

  return { next: { primary, extras }, ignored };
}

/** Puts this photo in the main slot. An angle that is promoted swaps with the old main photo. */
export function replacePrimary(current: RoomPhotoSet, file: File): RoomPhotoSet {
  if (!isRoomImage(file)) return current;
  const index = current.extras.findIndex((extra) => samePhoto(extra, file));
  if (index >= 0 && current.primary) {
    const extras = [...current.extras];
    extras[index] = current.primary;
    return { primary: current.extras[index], extras };
  }
  return {
    primary: file,
    extras: current.extras.filter((extra) => !samePhoto(extra, file)),
  };
}

export function uploadTrimNotice(requested: number, sent: number): string | null {
  if (requested <= 0 || sent >= requested) return null;
  return `Sent ${sent} of ${requested}. The rest were too large.`;
}

export function photoCountLine(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return "Read from 1 photo";
  return `Read from ${count} photos`;
}

/** One weak photo is the only case where another angle is worth suggesting. */
export function lowConfidenceAngleHint(
  confidence: number,
  count: number,
): string | null {
  if (count !== 1 || !(confidence < 0.55)) return null;
  return "A display-wall photo would help.";
}
