"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { RoomAnalysis } from "@/lib/roomAnalysis";
import { loadRoomAnalysisPayload } from "@/lib/resultStorage";

function decodeDataParam(dataParam: string): unknown {
  const decoded = decodeURIComponent(dataParam);
  try {
    return JSON.parse(decoded) as unknown;
  } catch {
    // Legacy: data was encodeURIComponent(btoa(JSON.stringify(...)))
    return JSON.parse(atob(decoded)) as unknown;
  }
}

type AnalyzeEnvelope =
  | { ok: true; meta?: { provider?: string; model?: string }; data: RoomAnalysis }
  | { ok: false; error: string };

export default function ResultsClient() {
  const params = useSearchParams();
  const dataParam = params.get("data");
  const [copied, setCopied] = useState(false);
  const [decoded, setDecoded] = useState<AnalyzeEnvelope | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      if (dataParam) {
        setDecoded(decodeDataParam(dataParam) as AnalyzeEnvelope);
      } else {
        const stored = loadRoomAnalysisPayload();
        setDecoded(stored as AnalyzeEnvelope | null);
      }
    } catch {
      setDecoded(null);
    } finally {
      setHydrated(true);
    }
  }, [dataParam]);

  const pretty = useMemo(() => {
    if (!decoded) return null;
    try {
      return JSON.stringify(decoded, null, 2);
    } catch {
      return null;
    }
  }, [decoded]);

  const analysis = decoded && decoded.ok ? decoded.data : null;
  const meta = decoded && decoded.ok ? decoded.meta : null;

  async function onCopyLink() {
    try {
      const text = pretty ?? window.location.href;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function onDownloadJson() {
    if (!pretty) return;
    const blob = new Blob([pretty], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "room-analysis.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 text-zinc-900">
      <main className="w-full max-w-3xl">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
              <p className="text-sm leading-6 text-zinc-600">
                Copy results as text or download JSON. Reloading `/results`
                replays your last analysis from your browser tab session until you run
                another one.
              </p>
            </div>

            <Link
              href="/"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            >
              New analysis
            </Link>
          </div>

          {!hydrated ? (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              Loading results…
            </div>
          ) : !decoded ? (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              No results found. Go back and analyze a photo.
            </div>
          ) : decoded.ok === false ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {decoded.error}
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onCopyLink}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  {copied ? "Copied" : "Copy results"}
                </button>
                <button
                  type="button"
                  onClick={onDownloadJson}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
                >
                  Download JSON
                </button>
              </div>

              {analysis ? (
                <div className="mt-6 grid gap-6">
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">Estimated dimensions</div>
                      {meta?.model ? (
                        <div className="text-xs text-zinc-500">
                          Model: {meta.model}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-2 text-sm">
                      <div className="flex flex-wrap gap-x-6 gap-y-1">
                        <div>
                          <span className="text-zinc-500">Length:</span>{" "}
                          <span className="font-semibold">
                            {analysis.dimensions.length} {analysis.dimensions.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Width:</span>{" "}
                          <span className="font-semibold">
                            {analysis.dimensions.width} {analysis.dimensions.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Height:</span>{" "}
                          <span className="font-semibold">
                            {analysis.dimensions.height} {analysis.dimensions.unit}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500">
                        Confidence:{" "}
                        {Math.round(analysis.dimensions.confidence * 100)}% —{" "}
                        {analysis.dimensions.reasoning}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-sm font-medium">Room summary</div>
                    <div className="mt-2 grid gap-2 text-sm">
                      <div>
                        <span className="text-zinc-500">Likely use:</span>{" "}
                        <span className="font-semibold">
                          {analysis.roomSummary.likelyUse}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Occupancy:</span>{" "}
                        <span className="font-semibold">
                          {analysis.roomSummary.occupancy}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-600">
                        <div className="font-medium text-zinc-700">
                          Key constraints
                        </div>
                        <ul className="mt-1 list-disc pl-5">
                          {analysis.roomSummary.keyConstraints.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="text-sm font-medium">Recommendations</div>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      {(
                        [
                          ["Camera", analysis.recommendations.camera],
                          ["Lighting", analysis.recommendations.lighting],
                          ["Acoustics", analysis.recommendations.acoustics],
                          ["Display", analysis.recommendations.display],
                          ["Seating", analysis.recommendations.seating],
                          ["Cabling", analysis.recommendations.cabling],
                          ["Network", analysis.recommendations.network],
                          ["Power", analysis.recommendations.power],
                        ] as const
                      ).map(([title, items]) => (
                        <div key={title} className="rounded-lg border border-zinc-200 p-3">
                          <div className="text-sm font-semibold">{title}</div>
                          <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
                            {items.map((it, i) => (
                              <li key={i}>{it}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-zinc-950 p-4 text-zinc-100">
                    <div className="text-sm font-medium">Quick checklist</div>
                    <ul className="mt-2 list-disc pl-5 text-sm text-zinc-200">
                      {analysis.quickChecklist.map((it, i) => (
                        <li key={i}>{it}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              <div className="mt-6">
                <div className="text-sm font-medium">Raw output</div>
                <pre className="mt-2 max-h-[60vh] overflow-auto rounded-xl border border-zinc-200 bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
                  {pretty}
                </pre>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

