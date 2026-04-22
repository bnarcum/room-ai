"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

    const form = new FormData();
    form.set("photo", file);
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
    // Prefer sessionStorage so large JSON + browser URL length limits do not break navigation.
    if (saveRoomAnalysisPayload(json)) {
      router.push("/results");
      return;
    }
    router.push(`/results?data=${encodeURIComponent(JSON.stringify(json))}`);
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 text-zinc-900">
      <main className="w-full max-w-3xl">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Room Vision Analyzer
            </h1>
            <p className="text-sm leading-6 text-zinc-600">
              Upload a single photo of a room. You’ll get a rough estimate of
              length, width, and height plus improvement suggestions for camera
              placement, lighting, acoustics, display, seating, cabling, network,
              and power.
            </p>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="grid gap-3">
              <label className="text-sm font-medium">Room photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
              />

              <div className="grid gap-2">
                <label className="text-sm font-medium">Reference (optional)</label>
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
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
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
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                ) : null}
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Preferred unit</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setUnit("feet")}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      unit === "feet"
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white"
                    }`}
                  >
                    Feet
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnit("meters")}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      unit === "meters"
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white"
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
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {status === "uploading" ? "Analyzing…" : "Analyze photo"}
              </button>

              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}

              <p className="text-xs leading-5 text-zinc-500">
                Tip: For best results, capture at least two walls and the
                ceiling/floor boundary. If you can include a reference object,
                the estimate improves.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="text-sm font-medium">Preview</div>
              <div className="aspect-video w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Selected room photo preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
                    Choose a photo to preview it here.
                  </div>
                )}
              </div>
              <div className="text-xs text-zinc-500">
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
