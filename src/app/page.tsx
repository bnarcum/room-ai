"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { preparePhotoForUpload } from "@/lib/prepareClientPhoto";
import { saveRoomAnalysisPayload } from "@/lib/resultStorage";

type AnalyzeResponse =
  | { ok: true; meta?: { provider?: string; model?: string }; data: unknown }
  | { ok: false; error: string };

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState<
    "none" | "credit-card" | "a4-letter-paper" | "known-ceiling-height"
  >("none");
  const [knownCeilingHeight, setKnownCeilingHeight] = useState<string>("");
  const [unit, setUnit] = useState<"feet" | "meters">("feet");
  const [status, setStatus] = useState<
    "idle" | "uploading" | "error" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function onAnalyze() {
    setError(null);
    if (!file) {
      setStatus("error");
      setError("Please choose a photo to upload.");
      return;
    }

    setStatus("uploading");

    let uploadFile: File;
    try {
      uploadFile = await preparePhotoForUpload(file);
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error
          ? e.message
          : "Could not prepare this photo for upload.",
      );
      return;
    }

    const form = new FormData();
    form.set("photo", uploadFile);
    form.set("reference", reference);
    form.set("unit", unit);
    if (reference === "known-ceiling-height") {
      form.set("knownCeilingHeight", knownCeilingHeight.trim());
    }

    let res: Response;
    try {
      res = await fetch("/api/analyze", { method: "POST", body: form });
    } catch {
      setStatus("error");
      setError("Network error while uploading. Please try again.");
      return;
    }

    if (res.status === 413) {
      setStatus("error");
      setError(
        "Upload was too large for the server (common with full‑resolution phone photos). The app compresses large files automatically — try Analyze again; if this persists, export a smaller JPEG.",
      );
      return;
    }

    const json = (await res.json().catch(() => null)) as AnalyzeResponse | null;
    if (!res.ok || !json || !json.ok) {
      setStatus("error");
      setError(
        (json && "error" in json && json.error) ||
          "The analysis failed. Please try a different photo."
      );
      return;
    }

    setStatus("done");
    // Never put the full payload in the URL — it exceeds limits and breaks /results.
    if (!saveRoomAnalysisPayload(json)) {
      setStatus("error");
      setError(
        "Could not save results in this browser (storage blocked or full). Allow site storage or try another browser, then analyze again.",
      );
      return;
    }
    router.push("/results");
  }

  return (
    <div className="app-backdrop flex min-h-full flex-1 flex-col items-center px-4 py-12 text-[hsl(210_40%_96%)]">
      <main className="w-full max-w-3xl">
        <div className="surface-card rounded-3xl p-7">
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[hsl(277_90%_72%/0.92)]">
              Vision
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Room Vision Analyzer
            </h1>
            <p className="copy-readable max-w-[52ch]">
              Upload a single photo of a room. You’ll get a rough estimate of
              length, width, and height plus improvement suggestions for camera
              placement, lighting, acoustics, display, seating, cabling, network,
              and power.
            </p>
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div className="grid gap-4">
              <label className="text-[15px] font-medium text-[hsl(210_40%_96%)]">
                Room photo
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.92)] px-3 py-2.5 text-[15px] text-[hsl(210_40%_96%)] outline-none transition-[box-shadow] file:mr-4 file:rounded-lg file:border-0 file:bg-[hsl(277_90%_65%/0.14)] file:px-3 file:py-2 file:text-[15px] file:font-semibold file:text-[hsl(210_40%_96%)] hover:file:bg-[hsl(277_90%_65%/0.22)] focus-visible:ring-2 focus-visible:ring-[hsl(277_90%_65%/0.45)]"
              />

              <div className="grid gap-2">
                <label className="text-[15px] font-medium text-[hsl(210_40%_96%)]">
                  Reference (optional)
                </label>
                <select
                  value={reference}
                  onChange={(e) =>
                    setReference(
                      e.target.value as
                        | "none"
                        | "credit-card"
                        | "a4-letter-paper"
                        | "known-ceiling-height"
                    )
                  }
                  className="w-full rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.92)] px-3 py-2.5 text-[15px] text-[hsl(210_40%_96%)] outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-[hsl(277_90%_65%/0.45)]"
                >
                  <option value="none">None (rough estimate)</option>
                  <option value="credit-card">Credit card in photo</option>
                  <option value="a4-letter-paper">A4/Letter paper in photo</option>
                  <option value="known-ceiling-height">
                    I know the ceiling height
                  </option>
                </select>
                {reference === "known-ceiling-height" ? (
                  <input
                    value={knownCeilingHeight}
                    onChange={(e) => setKnownCeilingHeight(e.target.value)}
                    placeholder='Example: "9 ft" or "2.7 m"'
                    className="w-full rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.92)] px-3 py-2.5 text-[15px] text-[hsl(210_40%_96%)] placeholder:text-[hsl(215_20%_55%)] outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-[hsl(277_90%_65%/0.45)]"
                  />
                ) : null}
              </div>

              <div className="grid gap-2">
                <label className="text-[15px] font-medium text-[hsl(210_40%_96%)]">
                  Preferred unit
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setUnit("feet")}
                    className={`rounded-xl border px-4 py-2 text-[15px] font-medium transition-colors ${
                      unit === "feet"
                        ? "border-[hsl(277_90%_65%/0.55)] bg-[hsl(277_90%_65%/0.14)] text-[hsl(210_40%_98%)] shadow-[0_0_28px_-8px_hsl(277_90%_65%/0.42)]"
                        : "border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] text-[hsl(215_20%_78%)] hover:border-[hsl(217_33%_35%)] hover:text-[hsl(210_40%_96%)]"
                    }`}
                  >
                    Feet
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnit("meters")}
                    className={`rounded-xl border px-4 py-2 text-[15px] font-medium transition-colors ${
                      unit === "meters"
                        ? "border-[hsl(277_90%_65%/0.55)] bg-[hsl(277_90%_65%/0.14)] text-[hsl(210_40%_98%)] shadow-[0_0_28px_-8px_hsl(277_90%_65%/0.42)]"
                        : "border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] text-[hsl(215_20%_78%)] hover:border-[hsl(217_33%_35%)] hover:text-[hsl(210_40%_96%)]"
                    }`}
                  >
                    Meters
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={onAnalyze}
                disabled={status === "uploading"}
                className="btn-accent mt-1 inline-flex items-center justify-center rounded-xl px-5 py-3 text-[15px] font-semibold disabled:cursor-not-allowed"
              >
                {status === "uploading" ? "Analyzing…" : "Analyze photo"}
              </button>

              {error ? (
                <p
                  className="rounded-xl border border-red-500/25 bg-red-950/40 px-3 py-2 text-[15px] leading-snug text-red-200"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <p className="copy-muted">
                Tip: For best results, capture at least two walls and the
                ceiling/floor boundary. If you can include a reference object,
                the estimate improves.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="text-[15px] font-medium text-[hsl(210_40%_96%)]">
                Preview
              </div>
              <div className="aspect-video w-full overflow-hidden rounded-2xl border border-[hsl(217_33%_25%)] bg-black/45 ring-1 ring-[hsl(217_33%_22%/0.6)]">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Selected room photo preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-4 text-center text-[15px] leading-relaxed text-[hsl(215_20%_68%)]">
                    Choose a photo to preview it here.
                  </div>
                )}
              </div>
              <div className="copy-muted">
                This app does not store your image server-side in v1; it only
                sends it to the model for analysis.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
