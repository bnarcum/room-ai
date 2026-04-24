"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SiteBrandLink } from "@/components/SiteBrand";
import { runClientRoomAnalysis } from "@/lib/runClientAnalysis";

const STEPS = [
  { n: 1, label: "Photo" },
  { n: 2, label: "Details" },
  { n: 3, label: "Analyze" },
  { n: 4, label: "Results" },
] as const;

export default function WizardClient() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [ceilingHeight, setCeilingHeight] = useState("");
  const [unit, setUnit] = useState<"feet" | "meters">("feet");
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
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

  async function onRunAnalysis() {
    if (!file) {
      setError("Choose a photo first.");
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("uploading");
    const result = await runClientRoomAnalysis({ file, unit, ceilingHeight });
    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setStatus("idle");
    setStep(4);
  }

  return (
    <div className="app-backdrop flex min-h-full flex-1 flex-col items-center px-4 py-8 text-[hsl(210_40%_96%)] sm:py-10">
      <main className="w-full max-w-2xl">
        <div className="mb-6 w-full sm:mb-8">
          <SiteBrandLink />
        </div>
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Guided wizard
            </h1>
            <p className="copy-muted mt-1 max-w-[56ch] text-[14px]">
              Step through the same analysis as the home page, then open the full
              Results view for exports.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2 text-sm font-medium text-[hsl(215_20%_82%)] transition-colors hover:border-[hsl(277_90%_65%/0.45)] hover:bg-[hsl(277_90%_65%/0.1)] hover:text-[hsl(210_40%_98%)]"
          >
            Classic one-page form
          </Link>
        </div>

        <nav
          className="mb-8 flex flex-wrap items-center justify-center gap-2"
          aria-label="Wizard progress"
        >
          {STEPS.map((s) => {
            const active = step === s.n;
            const done = step > s.n;
            return (
              <div
                key={s.n}
                className="flex items-center gap-2"
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={`flex h-8 min-w-8 items-center justify-center rounded-full text-[13px] font-semibold ${
                    active
                      ? "bg-[hsl(277_90%_55%/0.45)] text-white ring-2 ring-[hsl(277_90%_70%/0.5)]"
                      : done
                        ? "bg-[hsl(173_80%_40%/0.25)] text-[hsl(173_85%_80%)]"
                        : "bg-[hsl(217_33%_20%/0.5)] text-[hsl(215_20%_60%)]"
                  }`}
                >
                  {done ? "✓" : s.n}
                </span>
                <span
                  className={`text-[13px] font-medium max-sm:hidden ${
                    active
                      ? "text-[hsl(210_40%_96%)]"
                      : "text-[hsl(215_20%_60%)]"
                  }`}
                >
                  {s.label}
                </span>
                {s.n < 4 ? (
                  <span
                    className="text-[hsl(215_20%_40%)] max-sm:hidden"
                    aria-hidden
                  >
                    →
                  </span>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="surface-card rounded-3xl p-6 sm:p-8">
          {step === 1 ? (
            <div className="grid gap-5">
              <h2 className="text-lg font-semibold text-white">1. Choose a room photo</h2>
              <p className="copy-readable text-[15px]">
                Pick one image showing the room. Two walls and a ceiling line help
                the model size the space.
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                }}
                className="block w-full rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.92)] px-3 py-2.5 text-[15px] text-[hsl(210_40%_96%)] outline-none file:mr-4 file:rounded-lg file:border-0 file:bg-[hsl(277_90%_65%/0.14)] file:px-3 file:py-2 file:font-semibold"
              />
              <div className="aspect-video w-full overflow-hidden rounded-2xl border border-[hsl(217_33%_25%)] bg-black/40">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full min-h-[160px] w-full items-center justify-center text-[15px] text-[hsl(215_20%_58%)]">
                    No photo yet
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!file}
                  className="btn-accent rounded-xl px-5 py-2.5 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-5">
              <h2 className="text-lg font-semibold text-white">2. Room details</h2>
              <div className="grid gap-2">
                <label
                  htmlFor="wz-ceiling"
                  className="text-[15px] font-medium text-[hsl(210_40%_96%)]"
                >
                  Ceiling height (optional)
                </label>
                <input
                  id="wz-ceiling"
                  type="text"
                  value={ceilingHeight}
                  onChange={(e) => setCeilingHeight(e.target.value)}
                  placeholder="e.g. 9 ft or 2.7 m"
                  className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.92)] px-3 py-2.5 text-[15px] text-[hsl(210_40%_96%)] placeholder:text-[hsl(215_20%_55%)] outline-none"
                />
              </div>
              <div className="grid gap-2">
                <div className="text-[15px] font-medium text-[hsl(210_40%_96%)]">
                  Output units
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setUnit("feet")}
                    className={`rounded-xl border px-4 py-2 text-[15px] font-medium ${
                      unit === "feet"
                        ? "border-[hsl(277_90%_65%/0.55)] bg-[hsl(277_90%_65%/0.14)] text-[hsl(210_40%_98%)]"
                        : "border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] text-[hsl(215_20%_78%)]"
                    }`}
                  >
                    Feet
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnit("meters")}
                    className={`rounded-xl border px-4 py-2 text-[15px] font-medium ${
                      unit === "meters"
                        ? "border-[hsl(277_90%_65%/0.55)] bg-[hsl(277_90%_65%/0.14)] text-[hsl(210_40%_98%)]"
                        : "border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] text-[hsl(215_20%_78%)]"
                    }`}
                  >
                    Meters
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2.5 text-[15px] font-medium text-[hsl(210_40%_96%)]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep(3);
                  }}
                  className="btn-accent rounded-xl px-5 py-2.5 text-[15px] font-semibold"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-5">
              <h2 className="text-lg font-semibold text-white">3. Run analysis</h2>
              <p className="copy-readable text-[15px]">
                The photo is sent to the vision model. Nothing is kept on the server
                in v1 — results are stored in this tab only.
              </p>
              {previewUrl ? (
                <div className="aspect-[16/10] max-h-40 w-full max-w-sm overflow-hidden rounded-xl border border-[hsl(217_33%_25%)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              {error ? (
                <p
                  className="rounded-xl border border-red-500/25 bg-red-950/40 px-3 py-2 text-[15px] text-red-200"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep(2);
                  }}
                  disabled={status === "uploading"}
                  className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2.5 text-[15px] font-medium text-[hsl(210_40%_96%)] disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={onRunAnalysis}
                  disabled={!file || status === "uploading"}
                  className="btn-accent rounded-xl px-5 py-2.5 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {status === "uploading" ? "Analyzing…" : "Run analysis"}
                </button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-5 text-center sm:text-left">
              <h2 className="text-lg font-semibold text-white">4. Open your results</h2>
              <p className="copy-readable text-[15px]">
                Analysis is saved in this browser tab. The next page has dimensions,
                recommendations, and downloads for{" "}
                <span className="whitespace-nowrap">Collab Experience</span> and
                Webex Workspace Designer.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Link
                  href="/results"
                  className="btn-accent inline-flex items-center justify-center rounded-xl px-5 py-3 text-[15px] font-semibold"
                >
                  View full results
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setFile(null);
                    setCeilingHeight("");
                    setError(null);
                  }}
                  className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2.5 text-[15px] font-medium text-[hsl(210_40%_96%)]"
                >
                  Analyze another room
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
