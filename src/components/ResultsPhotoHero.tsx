"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { FocusBox, FocusRegionKey } from "@/lib/focusRegions";
import { containedImageRect } from "@/lib/containedImageRect";
import { round1 } from "@/lib/roomSizing";

const CAPTIONS: Record<FocusRegionKey, string> = {
  camera: "Camera",
  display: "Display",
  acoustics: "Audio",
  lighting: "Lighting",
  network: "Network",
};

type OverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const EMPTY_OVERLAY: OverlayRect = { left: 0, top: 0, width: 0, height: 0 };

type RoomSizeProof = {
  length: number;
  width: number;
  height: number;
  unit: "feet" | "meters";
};

type ResultsPhotoHeroProps = {
  src: string;
  region: FocusBox | null;
  captionKey: FocusRegionKey | null;
  onClear: () => void;
  size?: RoomSizeProof | null;
};

function sameRect(a: OverlayRect, b: OverlayRect) {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

export function ResultsPhotoHero({
  src,
  region,
  captionKey,
  onClear,
  size,
}: ResultsPhotoHeroProps) {
  const sizeLabel = size
    ? `${round1(size.length)} × ${round1(size.width)} × ${round1(size.height)} ${
        size.unit === "meters" ? "m" : "ft"
      }`
    : null;
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [overlay, setOverlay] = useState<OverlayRect>(EMPTY_OVERLAY);

  const syncOverlay = useCallback(() => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box || !img) return;
    const next = containedImageRect(
      box.clientWidth,
      box.clientHeight,
      img.naturalWidth,
      img.naturalHeight,
    );
    setOverlay((prev) => (sameRect(prev, next) ? prev : next));
  }, []);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    syncOverlay();
    const ro = new ResizeObserver(syncOverlay);
    ro.observe(box);
    const img = imgRef.current;
    if (img) ro.observe(img);
    window.addEventListener("resize", syncOverlay);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncOverlay);
    };
  }, [src, syncOverlay]);

  return (
    <div
      ref={boxRef}
      className="results-photo"
      data-testid="results-photo-frame"
      onClick={onClear}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt="Analyzed room photo"
        className="results-photo-img"
        data-testid="results-photo"
        onLoad={syncOverlay}
      />
      <div
        className="results-photo-overlay"
        data-testid="results-photo-overlay"
        style={{
          left: overlay.left,
          top: overlay.top,
          width: overlay.width,
          height: overlay.height,
        }}
      >
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
      {sizeLabel ? (
        <div className="results-size-proof" data-testid="results-size-proof">
          <span className="results-size-proof-rule" aria-hidden="true" />
          <span>{sizeLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
