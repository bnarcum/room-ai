"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Link from "next/link";
import { SiteBrandLink } from "@/components/SiteBrand";
import { runClientRoomAnalysis } from "@/lib/runClientAnalysis";

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [ceilingHeight, setCeilingHeight] = useState("");
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
    const result = await runClientRoomAnalysis({
      file,
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

  return (
    <div className="app-backdrop flex min-h-full flex-1 flex-col items-center px-4 py-8 text-[hsl(210_40%_96%)] sm:py-10">
      <main className="w-full max-w-3xl">
        <div className="mb-6 w-full sm:mb-8">
          <SiteBrandLink />
        </div>
        <div className="surface-card rounded-3xl p-7">
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[hsl(277_90%_72%/0.92)]">
              Collaboration spaces
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Room insights from a single photo
            </h1>
            <p className="copy-readable max-w-[52ch]">
              Upload a single photo of a room. You’ll get a rough estimate of
              length, width, and height plus improvement suggestions for camera
              placement, lighting, acoustics, display, seating, cabling, network,
              and power.
            </p>
            <p className="copy-muted mt-3 max-w-[52ch] text-[14px] leading-relaxed">
              When the run finishes, open{" "}
              <strong className="font-medium text-[hsl(215_20%_88%)]">Results</strong>{" "}
              for one-click exports to{" "}
              <span className="whitespace-nowrap">Collab Experience</span> (
              <code className="rounded border border-[hsl(217_33%_28%)] bg-[hsl(217_33%_18%/0.85)] px-1 py-0.5 font-mono text-[11px]">
                .vrc.json
              </code>
              ) and{" "}
              <span className="whitespace-nowrap">Webex Workspace Designer</span>.
            </p>
            <p className="mt-2 text-[14px] text-[hsl(215_20%_70%)]">
              Prefer a walkthrough?{" "}
              <Link
                href="/wizard"
                className="font-medium text-[hsl(277_90%_78%)] underline decoration-[hsl(277_90%_50%/0.4)] underline-offset-2 transition-colors hover:text-[hsl(210_40%_96%)] hover:decoration-[hsl(277_90%_65%/0.55)]"
              >
                Open the guided wizard
              </Link>
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
                <label
                  htmlFor="ceiling-height"
                  className="text-[15px] font-medium text-[hsl(210_40%_96%)]"
                >
                  Ceiling height (optional)
                </label>
                <input
                  id="ceiling-height"
                  type="text"
                  value={ceilingHeight}
                  onChange={(e) => setCeilingHeight(e.target.value)}
                  placeholder='e.g. 9 ft or 2.7 m — anchors room height if you know it'
                  autoComplete="off"
                  className="w-full rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.92)] px-3 py-2.5 text-[15px] text-[hsl(210_40%_96%)] placeholder:text-[hsl(215_20%_55%)] outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-[hsl(277_90%_65%/0.45)]"
                />
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
                ceiling/floor boundary. Entering ceiling height above improves
                scale when you know it.
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
