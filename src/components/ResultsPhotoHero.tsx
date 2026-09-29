"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { FocusBox, FocusRegionKey } from "@/lib/focusRegions";
import { containedImageRect } from "@/lib/containedImageRect";

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

type ResultsPhotoHeroProps = {
  src: string;
  region: FocusBox | null;
  captionKey: FocusRegionKey | null;
  onClear: () => void;
  sizeCaption?: string | null;
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
  sizeCaption,
}: ResultsPhotoHeroProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [overlay, setOverlay] = useState<OverlayRect>(EMPTY_OVERLAY);
  const [aspect, setAspect] = useState<number | null>(null);

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
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const ratio = img.naturalWidth / img.naturalHeight;
      setAspect((prev) => (prev === ratio ? prev : ratio));
    }
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
      style={
        aspect
          ? ({
              aspectRatio: String(aspect),
              "--photo-aspect": String(aspect),
            } as CSSProperties)
          : undefined
      }
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
      {sizeCaption ? (
        <p className="results-size-proof" data-testid="results-size-proof">
          {sizeCaption}
        </p>
      ) : null}
    </div>
  );
}
