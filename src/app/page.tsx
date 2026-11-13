"use client";

import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  DEMO_TOUR_ROOM_PHOTO,
  useTourDemo,
} from "@/components/TourDemoContext";
import { seedDemoAnalysisForTour } from "@/lib/demoAnalysisFixture";
import {
  EXAMPLE_ANGLE_LICENSE_URL,
  EXAMPLE_ANGLE_PHOTOS,
  EXAMPLE_ANGLE_SOURCE_URL,
  SAMPLE_CONFERENCE_PHOTO,
} from "@/lib/exampleRooms";
import { addRoomPhotos, isRoomImage, replacePrimary } from "@/lib/roomPhotoSet";
import { runClientRoomAnalysis } from "@/lib/runClientAnalysis";

async function fileFromPublicUrl(url: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not load the sample photo.");
  }
  const blob = await response.blob();
  const name = decodeURIComponent(url.split("/").pop() || "room.jpg");
  const type = blob.type || (name.endsWith(".png") ? "image/png" : "image/jpeg");
  return new File([blob], name, { type });
}

const ANALYZE_STAGES = [
  "Reading the walls",
  "Sizing the room",
  "Matching gear",
] as const;

function RoomWireframe() {
  return (
    <svg
      className="home-wireframe"
      viewBox="0 0 160 110"
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M18 90 L18 30 L80 12 L142 30 L142 90 Z" />
        <path d="M18 90 L80 102 L142 90" />
        <path d="M80 12 L80 102" />
        <path d="M48 90 L48 50 L68 44 L68 90" />
        <rect x="98" y="36" width="26" height="16" rx="1" />
      </g>
    </svg>
  );
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
  const [limitNote, setLimitNote] = useState<string | null>(null);
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
  const canAddAngle = extraFiles.length < 2;
  const canUseCamera = !file || extraFiles.length < 2;

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

  function applyAdded(incoming: File[], replaceSet = false) {
    const base = replaceSet ? { primary: null, extras: [] } : { primary: file, extras: extraFiles };
    const { next, ignored } = addRoomPhotos(base, incoming);
    setFile(next.primary);
    setExtraFiles(next.extras);
    setLimitNote(ignored > 0 ? "Only three photos are used." : null);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    applyAdded(Array.from(event.dataTransfer.files ?? []));
  }

  function onDropKeyDown(event: KeyboardEvent<HTMLLabelElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      document.getElementById("room-photo")?.click();
    }
  }

  function onPrimaryPicked(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    if (file && picked.length === 1 && isRoomImage(picked[0])) {
      const next = replacePrimary({ primary: file, extras: extraFiles }, picked[0]);
      setFile(next.primary);
      setExtraFiles(next.extras);
      setLimitNote(null);
      return;
    }
    applyAdded(picked, Boolean(file) && picked.length > 1);
  }

  function removeExtra(index: number) {
    setExtraFiles((prev) => prev.filter((_, i) => i !== index));
    setLimitNote(null);
  }

  function promoteExtra(index: number) {
    const chosen = extraFiles[index];
    if (!file || !chosen) return;
    const next = replacePrimary({ primary: file, extras: extraFiles }, chosen);
    setFile(next.primary);
    setExtraFiles(next.extras);
  }

  async function viewSampleResult() {
    setError(null);
    const saved = await seedDemoAnalysisForTour();
    if (!saved) {
      setError("Could not open the sample result in this browser.");
      return;
    }
    router.push("/results");
  }

  async function useSampleConference() {
    setError(null);
    try {
      const sample = await fileFromPublicUrl(SAMPLE_CONFERENCE_PHOTO);
      setFile(sample);
      setExtraFiles([]);
      setLimitNote(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the sample photo.");
    }
  }

  async function loadExampleAngles() {
    setError(null);
    try {
      const samples = await Promise.all(EXAMPLE_ANGLE_PHOTOS.map((url) => fileFromPublicUrl(url)));
      applyAdded(samples, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the example angles.");
    }
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
            One photo is enough. A second angle is optional.
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
              onDrop={(event) => {
                if (isAnalyzing) {
                  event.preventDefault();
                  return;
                }
                onDrop(event);
              }}
            >
              <input
                id="room-photo"
                type="file"
                accept="image/*"
                multiple
                disabled={isAnalyzing}
                onChange={(event) => {
                  onPrimaryPicked(event.target.files);
                  event.target.value = "";
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
                    <RoomWireframe />
                    <span className="home-drop-title">Drop a room photo</span>
                    <span className="home-drop-hint">or click to choose more than one</span>
                  </span>
                )}
              </label>
              {isAnalyzing ? (
                <div className="home-ritual" role="status" aria-live="polite">
                  <ol className="home-ritual-steps">
                    {ANALYZE_STAGES.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
            {file ? (
              <p className="home-filename">{file.name}</p>
            ) : tourActive ? (
              <p className="home-filename">conference-room.png</p>
            ) : null}
            {canUseCamera ? (
              <>
                <input
                  id="room-photo-camera"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    const picked = event.target.files?.[0];
                    event.target.value = "";
                    if (picked) applyAdded([picked]);
                  }}
                  className="home-file-input"
                />
                <label className="home-camera" htmlFor="room-photo-camera">
                  {file ? "Add a camera angle" : "Use camera"}
                </label>
              </>
            ) : null}
            <div className="home-angles" data-testid="home-extra-angles">
              {extraFiles.map((extra, index) => (
                <div key={`${extra.name}-${extra.lastModified}-${index}`} className="home-angle">
                  <div className="home-angle-frame">
                    <button
                      type="button"
                      className="home-angle-thumb"
                      onClick={() => promoteExtra(index)}
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
                  <button
                    type="button"
                    className="home-angle-main"
                    onClick={() => promoteExtra(index)}
                  >
                    Use as main
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
                      applyAdded(Array.from(event.target.files ?? []));
                      event.target.value = "";
                    }}
                    className="home-file-input"
                  />
                  Add another angle (optional)
                </label>
              ) : null}
              <p className="home-angle-hint">
                Main photo: two walls and where the ceiling meets the floor.
                Optional: the display wall, then the opposite corner.
              </p>
              {limitNote ? <p className="home-angle-hint">{limitNote}</p> : null}
            </div>
            <div className="home-samples">
              <button type="button" className="home-sample-btn" onClick={viewSampleResult} disabled={isAnalyzing}>
                View sample result
              </button>
              <button type="button" className="home-sample-btn" onClick={useSampleConference} disabled={isAnalyzing}>
                Use sample conference photo
              </button>
              <button type="button" className="home-sample-btn" onClick={loadExampleAngles} disabled={isAnalyzing}>
                Load example angles
              </button>
              <p className="home-credit">
                The conference image is a sample render. The office photos are three angles of one room.{" "}
                <a href={EXAMPLE_ANGLE_SOURCE_URL}>Famartin</a>
                {", "}
                <a href={EXAMPLE_ANGLE_LICENSE_URL}>CC BY-SA 4.0</a>.
              </p>
            </div>
          </div>

          <div className="home-controls">
            <div className="home-field" id="tour-options">
              <label htmlFor="ceiling-height" className="home-label">
                Ceiling height{" "}
                <span className="home-optional">optional</span>
              </label>
              <div className="home-input-wrap">
                <input
                  id="ceiling-height"
                  type="text"
                  inputMode="decimal"
                  value={ceilingHeight}
                  onChange={(event) => setCeilingHeight(event.target.value)}
                  placeholder={unit === "feet" ? "e.g. 9" : "e.g. 2.7"}
                  autoComplete="off"
                  className="home-input"
                />
                <span className="home-input-unit" aria-hidden="true">
                  {unit === "feet" ? "ft" : "m"}
                </span>
              </div>

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
              Photos are sent only for this analysis.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
