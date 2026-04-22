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
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 text-zinc-900">
      <main className="w-full max-w-3xl">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
              <p className="text-sm leading-6 text-zinc-600">
                Scroll to <strong>Downloads</strong> for the Collab{" "}
                <code className="font-mono text-xs">.vrc.json</code> file. That
                export embeds your analysis under{" "}
                <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">
                  roomAi
                </code>
                , room defaults, and a starter table / display / Room Bar Pro
                layout. Recommendation text does not appear on the collab canvas —
                only in the JSON.
              </p>
            </div>

            <Link
              href="/"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            >
              New analysis
            </Link>
          </div>

          <section
            className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5"
            aria-label="Download exports"
          >
            <h2 className="text-base font-semibold text-zinc-900">Downloads</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Use the first button for{" "}
              <span className="whitespace-nowrap">collabexperience.com</span>. The
              third button is only the app&apos;s{" "}
              <code className="font-mono text-xs">{`{ ok, data }`}</code> JSON — not
              for Video Room Calculator.
            </p>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              <span className="font-semibold">Import tip:</span>{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
                room-ai-analysis.json
              </code>{" "}
              cannot be opened in Video Room Calculator — you need{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
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
                className="order-1 w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 sm:order-none sm:w-auto sm:px-3 sm:py-2"
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
                className="order-2 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:order-none sm:w-auto sm:px-3 sm:py-2"
              >
                {copied ? "Copied" : "Copy results"}
              </button>
              <button
                type="button"
                onClick={onDownloadJson}
                disabled={loading || !pretty}
                className="order-3 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:order-none sm:w-auto sm:px-3 sm:py-2"
                title="App export only — not for Video Room Calculator"
              >
                Download full analysis (room-ai).json
              </button>
            </div>
          </section>
          {loading ? (
            <p className="mt-2 text-xs text-zinc-500">
              Loading saved results from this browser tab…
            </p>
          ) : null}
          {!loading && !decoded ? (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              No results in this tab yet. Go back and analyze a photo, or use{" "}
              <strong>Choose JSON file…</strong> below to build a{" "}
              <code className="font-mono text-xs">.vrc.json</code> from an older
              export.
            </div>
          ) : null}
          {!loading && decoded && decoded.ok === false ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {decoded.error}
            </div>
          ) : null}

          {!loading && decoded && decoded.ok ? (
            <>
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
                            {analysis.dimensions.length}{" "}
                            {analysis.dimensions.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Width:</span>{" "}
                          <span className="font-semibold">
                            {analysis.dimensions.width}{" "}
                            {analysis.dimensions.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Height:</span>{" "}
                          <span className="font-semibold">
                            {analysis.dimensions.height}{" "}
                            {analysis.dimensions.unit}
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
                        <div
                          key={title}
                          className="rounded-lg border border-zinc-200 p-3"
                        >
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
                <p className="mt-1 text-xs text-zinc-500">
                  This is the same JSON as &quot;Download full analysis&quot; — not a
                  Collab Experience import file.
                </p>
                <pre className="mt-2 max-h-[60vh] overflow-auto rounded-xl border border-zinc-200 bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
                  {pretty}
                </pre>
              </div>
            </>
          ) : null}

          <div className="mt-8 border-t border-zinc-200 pt-6">
            <div className="text-sm font-medium text-zinc-900">
              Convert saved room-ai JSON → Collab (.vrc.json)
            </div>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              If you only have an older export like{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">
                room-analysisv4.json
              </code>{" "}
              ({`ok`}/{`data`}), choose it here and we will download a proper{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">
                .vrc.json
              </code>{" "}
              you can open on collabexperience.com.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
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
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
              >
                Choose JSON file…
              </button>
            </div>
            {convertNote ? (
              <p
                className={`mt-3 text-sm ${
                  convertNote.kind === "ok"
                    ? "text-green-800"
                    : "text-red-700"
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
