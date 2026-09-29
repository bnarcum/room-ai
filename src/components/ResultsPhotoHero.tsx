"use client";

import type { FocusBox, FocusRegionKey } from "@/lib/focusRegions";

const CAPTIONS: Record<FocusRegionKey, string> = {
  camera: "Camera",
  display: "Display",
  acoustics: "Audio",
  lighting: "Lighting",
  network: "Network",
};

type ResultsPhotoHeroProps = {
  src: string;
  region: FocusBox | null;
  captionKey: FocusRegionKey | null;
  onClear: () => void;
};

export function ResultsPhotoHero({
  src,
  region,
  captionKey,
  onClear,
}: ResultsPhotoHeroProps) {
  return (
    <div
      className="results-photo"
      data-testid="results-photo-frame"
      onClick={onClear}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Analyzed room photo"
        className="results-photo-img"
        data-testid="results-photo"
      />
      {region && captionKey ? (
        <div
          className="results-spotlight"
          data-testid="photo-spotlight"
          data-region={captionKey}
          style={{
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.w * 100}%`,
            height: `${region.h * 100}%`,
          }}
        >
          <span
            className="results-spotlight-caption"
            data-testid="photo-spotlight-caption"
          >
            {CAPTIONS[captionKey]}
          </span>
        </div>
      ) : null}
    </div>
  );
}
