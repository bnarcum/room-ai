"use client";

import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  DEMO_TOUR_ROOM_PHOTO,
  useTourDemo,
} from "@/components/TourDemoContext";
import { runClientRoomAnalysis } from "@/lib/runClientAnalysis";

function isDroppedImage(file: File) {
  return file.type.startsWith("image/") || file.type === "";
}

export default function Home() {
  const router = useRouter();
  const { active: tourActive, analyzing: tourAnalyzing, canDemoAnalyze, startDemoAnalyze } =
    useTourDemo();
  const [file, setFile] = useState<File | null>(null);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [ceilingHeight, setCeilingHeight] = useState("");
  const [unit, setUnit] = useState<"feet" | "meters">("feet");
  const [status, setStatus] = useState<
    "idle" | "uploading" | "error" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const extraPreviewUrls = useMemo(
    () => extraFiles.map((extra) => URL.createObjectURL(extra)),
    [extraFiles],
  );

  const displayPreviewUrl =
    previewUrl ?? (tourActive ? DEMO_TOUR_ROOM_PHOTO : null);
  const isAnalyzing = status === "uploading" || tourAnalyzing;
  const canAddAngle = Boolean(file) && extraFiles.length < 2;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      extraPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [extraPreviewUrls]);

  async function onAnalyze() {
    setError(null);
    if (!file) {
      if (canDemoAnalyze) {
        startDemoAnalyze();
        return;
      }
      setStatus("error");
      setError("Please choose a photo to upload.");
      return;
    }

    setStatus("uploading");
    const result = await runClientRoomAnalysis({
      file,
      extraFiles,
      unit,
      ceilingHeight,
    });
    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setStatus("done");
    router.push("/results");
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped && isDroppedImage(dropped)) {
      setFile(dropped);
    }
  }

  function onDropKeyDown(event: KeyboardEvent<HTMLLabelElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      document.getElementById("room-photo")?.click();
    }
  }

  function addExtraFiles(list: FileList | null) {
    const picked = Array.from(list ?? []).filter(isDroppedImage);
    if (picked.length === 0) return;
    setExtraFiles((prev) => [...prev, ...picked].slice(0, 2));
  }

  function removeExtra(index: number) {
    setExtraFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function promoteExtra(index: number) {
    if (!file) return;
    const nextPrimary = extraFiles[index];
    if (!nextPrimary) return;
    setFile(nextPrimary);
    setExtraFiles((prev) => {
      const copy = [...prev];
      copy[index] = file;
      return copy;
    });
  }

  return (
    <div className="home-apple">
      <main className="home-shell">
        <header className="results-topbar">
          <Link href="/" className="results-wordmark">
            SnapRoom
          </Link>
        </header>

        <div className="home-headline" id="tour-hero">
          <h1 className="results-headline-title">Analyze a room</h1>
          <p className="results-headline-meta">
            A first look at the space — from a single photograph.
          </p>
        </div>

        <div className="home-layout">
          <div className="home-photo-col">
            <div
              id="tour-upload"
              className={`home-drop${dragOver ? " is-over" : ""}${displayPreviewUrl ? " has-photo" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <input
                id="room-photo"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                }}
                className="home-file-input"
              />
              <label
                htmlFor="room-photo"
                className="home-drop-hit"
                tabIndex={0}
                onKeyDown={onDropKeyDown}
              >
                {displayPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={displayPreviewUrl}
                    alt="Selected room photo preview"
                    className="home-preview-img"
                  />
                ) : (
                  <span className="home-drop-copy">
                    <span className="home-drop-title">Drop a room photo</span>
                    <span className="home-drop-hint">or click to choose</span>
                  </span>
                )}
              </label>
            </div>
            {file ? (
              <p className="home-filename">{file.name}</p>
            ) : tourActive ? (
              <p className="home-filename">conference-room.png</p>
            ) : null}
            {file ? (
              <div className="home-angles" data-testid="home-extra-angles">
                {extraFiles.map((extra, index) => (
                  <div key={`${extra.name}-${index}`} className="home-angle">
                    <button
                      type="button"
                      className="home-angle-thumb"
                      onClick={() => promoteExtra(index)}
                      title="Use as primary photo"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={extraPreviewUrls[index]} alt={`Extra angle ${index + 1}`} />
                    </button>
                    <button
                      type="button"
                      className="home-angle-remove"
                      onClick={() => removeExtra(index)}
                      aria-label={`Remove extra angle ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {canAddAngle ? (
                  <label className="home-add-angle" htmlFor="room-photo-extra">
                    <input
                      id="room-photo-extra"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => {
                        addExtraFiles(event.target.files);
                        event.target.value = "";
                      }}
                      className="home-file-input"
                    />
                    Add another angle (optional)
                  </label>
                ) : null}
                <p className="home-angle-hint">
                  Display wall, then the opposite corner.
                </p>
              </div>
            ) : null}
          </div>

          <div className="home-controls">
            <div className="home-field" id="tour-options">
              <label htmlFor="ceiling-height" className="home-label">
                Ceiling height{" "}
                <span className="home-optional">optional</span>
              </label>
              <input
                id="ceiling-height"
                type="text"
                value={ceilingHeight}
                onChange={(event) => setCeilingHeight(event.target.value)}
                placeholder="9 ft or 2.7 m"
                autoComplete="off"
                className="home-input"
              />

              <div
                className="home-units"
                role="group"
                aria-label="Preferred unit"
              >
                <button
                  type="button"
                  onClick={() => setUnit("feet")}
                  className={unit === "feet" ? "is-active" : undefined}
                >
                  Feet
                </button>
                <span className="home-units-sep" aria-hidden="true">
                  |
                </span>
                <button
                  type="button"
                  onClick={() => setUnit("meters")}
                  className={unit === "meters" ? "is-active" : undefined}
                >
                  Meters
                </button>
              </div>
            </div>

            <button
              type="button"
              id="tour-analyze"
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className="results-btn results-btn-solid home-analyze"
            >
              {isAnalyzing ? "Analyzing…" : "Analyze"}
            </button>

            {error ? (
              <p className="home-error" role="alert">
                {error}
              </p>
            ) : null}

            <p className="home-privacy" id="tour-privacy">
              Photo is sent only for this analysis.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
