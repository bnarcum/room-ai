"use client";

import {
  type ChangeEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  buildVideoRoomCalculatorJson,
  tryBuildVrcFromRoomAiJson,
  vrcJsonFileName,
} from "@/lib/collabExperienceExport";
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
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const [decoded, setDecoded] = useState<AnalyzeEnvelope | null>(null);
  /** False until we've read sessionStorage / URL on the client (avoid useSearchParams — it forces CSR bailout). */
  const [ready, setReady] = useState(false);
  const [convertNote, setConvertNote] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const convertInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const dataParam = q.get("data");
      if (dataParam) {
        setDecoded(decodeDataParam(dataParam) as AnalyzeEnvelope);
      } else {
        const stored = loadRoomAnalysisPayload();
        setDecoded(stored as AnalyzeEnvelope | null);
      }
    } catch {
      setDecoded(null);
    } finally {
      setReady(true);
    }
  }, [pathname]);

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
  const loading = !ready;
  const canExportVrc = Boolean(ready && analysis);

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
    a.download = "room-ai-analysis.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onDownloadVrcJson() {
    if (!analysis) return;
    const vrc = buildVideoRoomCalculatorJson(analysis, {
      meta: meta ?? undefined,
    });
    const text = JSON.stringify(vrc, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = vrcJsonFileName(vrc.name);
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onConvertEnvelopeFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setConvertNote(null);
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setConvertNote({ kind: "err", text: "That file is not valid JSON." });
      return;
    }
    const result = tryBuildVrcFromRoomAiJson(parsed);
    if (!result.ok) {
      setConvertNote({ kind: "err", text: result.error });
      return;
    }
    const filename = vrcJsonFileName(result.vrc.name);
    const text = JSON.stringify(result.vrc, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setConvertNote({
      kind: "ok",
      text: `Downloaded ${filename}. Import that file on collabexperience.com (not the original).`,
    });
  }

  return (
    <div className="app-backdrop flex min-h-full flex-1 flex-col items-center px-4 py-12 text-[hsl(210_40%_96%)]">
      <main className="w-full max-w-3xl">
        <div className="surface-card rounded-3xl p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[hsl(277_90%_72%/0.92)]">
                Output
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                Results
              </h1>
              <p className="copy-readable max-w-[62ch]">
                Scroll to <strong className="font-semibold text-[hsl(210_40%_98%)]">Downloads</strong> for the Collab{" "}
                <code className="rounded border border-[hsl(217_33%_30%)] bg-[hsl(217_33%_22%/0.85)] px-1.5 py-0.5 font-mono text-xs text-[hsl(277_90%_78%)]">
                  .vrc.json
                </code>{" "}
                file. That export embeds your analysis under{" "}
                <code className="rounded border border-[hsl(217_33%_30%)] bg-[hsl(217_33%_22%/0.85)] px-1.5 py-0.5 font-mono text-xs text-[hsl(277_90%_78%)]">
                  roomAi
                </code>
                , room defaults, and a starter table / display / Room Bar Pro
                layout. Recommendation text does not appear on the collab canvas —
                only in the JSON.
              </p>
            </div>

            <Link
              href="/"
              className="shrink-0 rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2 text-sm font-medium text-[hsl(215_20%_82%)] transition-colors hover:border-[hsl(277_90%_65%/0.45)] hover:bg-[hsl(277_90%_65%/0.1)] hover:text-[hsl(210_40%_98%)]"
            >
              New analysis
            </Link>
          </div>

          <section
            className="mt-8 rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.55)] p-6"
            aria-label="Download exports"
          >
            <h2 className="text-base font-semibold text-white">Downloads</h2>
            <p className="copy-readable mt-2">
              Use the first button for{" "}
              <span className="whitespace-nowrap text-[hsl(215_20%_88%)]">collabexperience.com</span>. The
              third button is only the app&apos;s{" "}
              <code className="rounded border border-[hsl(217_33%_28%)] bg-[hsl(217_33%_18%/0.9)] px-1 py-0.5 font-mono text-[11px] text-[hsl(215_20%_85%)]">{`{ ok, data }`}</code> JSON — not
              for Video Room Calculator.
            </p>

            <div className="mt-4 rounded-xl border border-[hsl(173_80%_40%/0.28)] bg-[hsl(173_80%_40%/0.09)] px-4 py-3 text-[15px] leading-relaxed text-[hsl(210_40%_96%)]">
              <span className="font-semibold text-[hsl(173_85%_48%)]">Import tip:</span>{" "}
              <code className="rounded border border-[hsl(217_33%_30%)] bg-[hsl(220_25%_8%/0.65)] px-1.5 py-0.5 font-mono text-[13px] text-[hsl(210_40%_96%)]">
                room-ai-analysis.json
              </code>{" "}
              cannot be opened in Video Room Calculator — you need{" "}
              <code className="rounded border border-[hsl(217_33%_30%)] bg-[hsl(220_25%_8%/0.65)] px-1.5 py-0.5 font-mono text-[13px] text-[hsl(210_40%_96%)]">
                .vrc.json
              </code>{" "}
              (first button) or convert with &quot;Choose JSON file…&quot; at the
              bottom.
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={onDownloadVrcJson}
                disabled={!canExportVrc}
                className="btn-accent order-1 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed sm:order-none sm:w-auto sm:px-4 sm:py-2.5"
                title={
                  canExportVrc
                    ? "Opens in collabexperience.com Video Room Calculator"
                    : loading
                      ? "Loading saved results…"
                      : "Run an analysis first, or convert a saved JSON file below"
                }
              >
                Download for Collab Experience (.vrc.json)
              </button>
              <button
                type="button"
                onClick={onCopyLink}
                disabled={loading || !pretty}
                className="order-2 w-full rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-3 text-[15px] font-semibold text-[hsl(210_40%_96%)] transition-colors hover:border-[hsl(217_33%_35%)] hover:bg-[hsl(217_33%_18%/0.95)] disabled:cursor-not-allowed disabled:opacity-45 sm:order-none sm:w-auto sm:px-4 sm:py-2.5"
              >
                {copied ? "Copied" : "Copy results"}
              </button>
              <button
                type="button"
                onClick={onDownloadJson}
                disabled={loading || !pretty}
                className="order-3 w-full rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-3 text-[15px] font-semibold text-[hsl(210_40%_96%)] transition-colors hover:border-[hsl(217_33%_35%)] hover:bg-[hsl(217_33%_18%/0.95)] disabled:cursor-not-allowed disabled:opacity-45 sm:order-none sm:w-auto sm:px-4 sm:py-2.5"
                title="App export only — not for Video Room Calculator"
              >
                Download full analysis (room-ai).json
              </button>
            </div>
          </section>
          {loading ? (
            <p className="copy-muted mt-3">
              Loading saved results from this browser tab…
            </p>
          ) : null}
          {!loading && !decoded ? (
            <div className="mt-6 rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.65)] p-4 text-[15px] leading-relaxed text-[hsl(215_20%_84%)]">
              No results in this tab yet. Go back and analyze a photo, or use{" "}
              <strong className="text-white">Choose JSON file…</strong> below to build a{" "}
              <code className="rounded border border-[hsl(217_33%_28%)] bg-[hsl(217_33%_18%/0.9)] px-1 py-0.5 font-mono text-xs text-[hsl(277_90%_75%)]">
                .vrc.json
              </code>{" "}
              from an older export.
            </div>
          ) : null}
          {!loading && decoded && decoded.ok === false ? (
            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-950/45 p-4 text-sm text-red-200">
              {decoded.error}
            </div>
          ) : null}

          {!loading && decoded && decoded.ok ? (
            <>
              {analysis ? (
                <div className="mt-8 grid gap-6">
                  <div className="rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.45)] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-[hsl(210_40%_98%)]">
                        Estimated dimensions
                      </div>
                      {meta?.model ? (
                        <div className="text-sm text-[hsl(215_20%_68%)]">
                          Model: {meta.model}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-4 grid gap-2 text-sm">
                      <div className="flex flex-wrap gap-x-8 gap-y-2">
                        <div>
                          <span className="text-[hsl(215_20%_68%)]">Length:</span>{" "}
                          <span className="font-semibold text-white">
                            {analysis.dimensions.length}{" "}
                            {analysis.dimensions.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-[hsl(215_20%_68%)]">Width:</span>{" "}
                          <span className="font-semibold text-white">
                            {analysis.dimensions.width}{" "}
                            {analysis.dimensions.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-[hsl(215_20%_68%)]">Height:</span>{" "}
                          <span className="font-semibold text-white">
                            {analysis.dimensions.height}{" "}
                            {analysis.dimensions.unit}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm leading-relaxed text-[hsl(215_20%_72%)]">
                        Confidence:{" "}
                        {Math.round(analysis.dimensions.confidence * 100)}% —{" "}
                        {analysis.dimensions.reasoning}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.35)] p-5">
                    <div className="text-sm font-medium text-[hsl(210_40%_98%)]">
                      Room summary
                    </div>
                    <div className="mt-3 grid gap-2 text-sm">
                      <div>
                        <span className="text-[hsl(215_20%_68%)]">Likely use:</span>{" "}
                        <span className="font-semibold text-[hsl(210_40%_96%)]">
                          {analysis.roomSummary.likelyUse}
                        </span>
                      </div>
                      <div>
                        <span className="text-[hsl(215_20%_68%)]">Occupancy:</span>{" "}
                        <span className="font-semibold text-[hsl(210_40%_96%)]">
                          {analysis.roomSummary.occupancy}
                        </span>
                      </div>
                      <div className="text-[15px] leading-relaxed text-[hsl(215_20%_78%)]">
                        <div className="font-medium text-[hsl(215_20%_85%)]">
                          Key constraints
                        </div>
                        <ul className="mt-2 list-disc pl-5 text-[hsl(215_20%_78%)]">
                          {analysis.roomSummary.keyConstraints.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.45)] p-5">
                    <div className="text-sm font-medium text-[hsl(210_40%_98%)]">
                      Recommendations
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                        <div
                          key={title}
                          className="rounded-xl border border-[hsl(217_33%_22%)] bg-[hsl(220_25%_8%/0.45)] p-4 transition-colors hover:border-[hsl(277_90%_65%/0.22)]"
                        >
                          <div className="text-[15px] font-semibold text-[hsl(277_90%_74%)]">
                            {title}
                          </div>
                          <ul className="mt-2 list-disc pl-5 text-[15px] leading-relaxed text-[hsl(215_20%_78%)]">
                            {items.map((it, i) => (
                              <li key={i}>{it}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[hsl(277_90%_65%/0.28)] bg-gradient-to-br from-[hsl(277_45%_16%/0.55)] to-[hsl(217_33%_14%/0.95)] p-5">
                    <div className="text-[15px] font-medium text-[hsl(210_40%_98%)]">
                      Quick checklist
                    </div>
                    <ul className="mt-3 list-disc pl-5 text-[15px] leading-relaxed text-[hsl(215_20%_82%)]">
                      {analysis.quickChecklist.map((it, i) => (
                        <li key={i}>{it}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              <div className="mt-8">
                <div className="text-sm font-medium text-[hsl(210_40%_98%)]">
                  Raw output
                </div>
                <p className="copy-muted mt-2">
                  This is the same JSON as &quot;Download full analysis&quot; — not a
                  Collab Experience import file.
                </p>
                <pre className="mt-3 max-h-[60vh] overflow-auto rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(220_25%_7%/0.92)] p-4 text-[13px] leading-relaxed text-[hsl(215_20%_82%)] [font-variant-ligatures:none]">
                  {pretty}
                </pre>
              </div>
            </>
          ) : null}

          <div className="mt-10 border-t border-[hsl(217_33%_25%)] pt-8">
            <div className="text-sm font-medium text-[hsl(210_40%_98%)]">
              Convert saved room-ai JSON → Collab (.vrc.json)
            </div>
            <p className="copy-readable mt-2">
              If you only have an older export like{" "}
              <code className="rounded border border-[hsl(217_33%_28%)] bg-[hsl(217_33%_18%/0.9)] px-1.5 py-0.5 font-mono text-xs text-[hsl(215_20%_88%)]">
                room-analysisv4.json
              </code>{" "}
              ({`ok`}/{`data`}), choose it here and we will download a proper{" "}
              <code className="rounded border border-[hsl(217_33%_28%)] bg-[hsl(217_33%_18%/0.9)] px-1.5 py-0.5 font-mono text-xs text-[hsl(215_20%_88%)]">
                .vrc.json
              </code>{" "}
              you can open on collabexperience.com.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                ref={convertInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={onConvertEnvelopeFile}
              />
              <button
                type="button"
                onClick={() => convertInputRef.current?.click()}
                className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2.5 text-[15px] font-semibold text-[hsl(210_40%_96%)] transition-colors hover:border-[hsl(277_90%_65%/0.45)] hover:bg-[hsl(277_90%_65%/0.1)] hover:text-[hsl(210_40%_98%)]"
              >
                Choose JSON file…
              </button>
            </div>
            {convertNote ? (
              <p
                className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
                  convertNote.kind === "ok"
                    ? "border-emerald-500/25 bg-emerald-950/35 text-emerald-200"
                    : "border-red-500/25 bg-red-950/40 text-red-200"
                }`}
              >
                {convertNote.text}
              </p>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
