"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteBrandLink } from "@/components/SiteBrand";
import {
  buildVideoRoomCalculatorJson,
  vrcJsonFileName,
} from "@/lib/collabExperienceExport";
import { coerceRoomAnalysisPayload } from "@/lib/coerceRoomAnalysis";
import {
  buildWebexDesignerRoomJson,
  webexDesignerJsonFileName,
} from "webex-designer-export";
import { roomAnalysisSchema, type RoomAnalysis } from "@/lib/roomAnalysis";
import {
  effectiveSeatCount,
  firstSentence,
  resultsHeadline,
} from "@/lib/roomSizing";
import {
  loadRoomAnalysisPayload,
  loadRoomPhotoPreview,
} from "@/lib/resultStorage";
import { buildWebexDesignerSummaryUrl } from "@/lib/webexDesignerQuickUrl";

function decodeDataParam(dataParam: string): unknown {
  const decoded = decodeURIComponent(dataParam);
  try {
    return JSON.parse(decoded) as unknown;
  } catch {
    return JSON.parse(atob(decoded)) as unknown;
  }
}

type AnalyzeEnvelope =
  | { ok: true; meta?: { provider?: string; model?: string }; data: unknown }
  | { ok: false; error: string };

function parseAnalysis(raw: unknown): RoomAnalysis | null {
  const parsed = roomAnalysisSchema.safeParse(coerceRoomAnalysisPayload(raw));
  return parsed.success ? parsed.data : null;
}

const REC_ROWS = [
  ["Camera", "camera"],
  ["Display", "display"],
  ["Audio", "acoustics"],
  ["Lighting", "lighting"],
  ["Network", "network"],
] as const;

export default function ResultsClient() {
  const pathname = usePathname();
  const [copiedJson, setCopiedJson] = useState(false);
  const [exportTip, setExportTip] = useState<ReactNode>(null);
  const [decoded, setDecoded] = useState<AnalyzeEnvelope | null>(null);
  const [ready, setReady] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!exportTip) return;
    const id = window.setTimeout(() => setExportTip(null), 30_000);
    return () => window.clearTimeout(id);
  }, [exportTip]);

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
      setPhotoPreview(loadRoomPhotoPreview());
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

  const analysis =
    decoded && decoded.ok ? parseAnalysis(decoded.data) : null;
  const meta = decoded && decoded.ok ? decoded.meta : null;
  const parseFailed = Boolean(decoded && decoded.ok && !analysis);

  const seatCount = analysis ? effectiveSeatCount(analysis) : 0;
  const designerUrl = analysis
    ? buildWebexDesignerSummaryUrl(seatCount)
    : null;

  const loading = !ready;
  const canExportVrc = Boolean(ready && analysis);

  async function onCopyAnalysisJson() {
    if (!pretty) return;
    try {
      await navigator.clipboard.writeText(pretty);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      setCopiedJson(false);
    }
  }

  function onDownloadJson() {
    if (!pretty) return;
    const blob = new Blob([pretty], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "snaproom-analysis.json";
    a.click();
    URL.revokeObjectURL(url);
    setExportTip("Saved snaproom-analysis.json.");
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
    setExportTip(
      "Downloaded .vrc.json — import on collabexperience.com (New → Open File).",
    );
  }

  function onDownloadWebexDesignerJson() {
    if (!analysis) return;
    const doc = buildWebexDesignerRoomJson(analysis);
    const text = JSON.stringify(doc, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = webexDesignerJsonFileName(doc.title);
    a.click();
    URL.revokeObjectURL(url);
    setExportTip(
      <>
        Downloaded Designer JSON — drag onto the 3D view at{" "}
        <a
          href="https://designer.webex.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[hsl(173_85%_58%)] underline underline-offset-2"
        >
          designer.webex.com
        </a>
        .
      </>,
    );
  }

  return (
    <div className="app-backdrop flex min-h-full flex-1 flex-col items-center px-4 py-8 text-[hsl(210_40%_96%)] sm:py-10">
      <main className="w-full max-w-3xl">
        <div className="mb-6 w-full sm:mb-8">
          <SiteBrandLink />
        </div>
        <div className="surface-card rounded-3xl p-7">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Results
            </h1>
            <Link
              href="/"
              className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2 text-sm font-medium text-[hsl(215_20%_82%)] transition-colors hover:border-[hsl(277_90%_65%/0.45)] hover:bg-[hsl(277_90%_65%/0.1)] hover:text-[hsl(210_40%_98%)]"
            >
              New analysis
            </Link>
          </div>

          {loading ? (
            <p className="copy-muted mt-6">Loading results…</p>
          ) : null}
          {!loading && !decoded ? (
            <div className="mt-6 rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.65)] p-4 text-[15px] leading-relaxed text-[hsl(215_20%_84%)]">
              No results in this tab yet.{" "}
              <Link
                href="/"
                className="font-semibold text-white underline underline-offset-2"
              >
                Analyze a photo
              </Link>
              .
            </div>
          ) : null}
          {!loading && decoded && decoded.ok === false ? (
            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-950/45 p-4 text-sm text-red-200">
              {decoded.error}
            </div>
          ) : null}
          {!loading && parseFailed ? (
            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-950/45 p-4 text-sm text-red-200">
              Saved results could not be read. Run a new analysis from the home
              page.
            </div>
          ) : null}

          {!loading && analysis ? (
            <div className="mt-8 grid gap-6">
              {photoPreview ? (
                <div className="overflow-hidden rounded-2xl border border-[hsl(217_33%_25%)] bg-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt="Analyzed room photo"
                    className="mx-auto max-h-40 w-full object-cover"
                    data-testid="results-photo"
                  />
                </div>
              ) : null}

              <section
                className="rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.45)] p-5"
                id="tour-room-read"
                aria-label="Room read"
              >
                <p
                  id="tour-dimensions"
                  className="text-[20px] font-semibold tracking-tight text-white"
                  data-testid="results-headline"
                >
                  {resultsHeadline(analysis)}
                </p>
              </section>

              <section
                className="rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.45)] p-5"
                id="tour-recommendations"
                aria-label="Recommendations"
              >
                <ul className="grid gap-3">
                  {REC_ROWS.map(([title, key]) => {
                    const line = firstSentence(
                      analysis.recommendations[key][0] ?? "",
                    );
                    return (
                      <li
                        key={title}
                        className="text-[15px] leading-snug text-[hsl(215_20%_82%)]"
                        data-testid={`rec-${title}`}
                      >
                        <span className="font-semibold text-[hsl(277_90%_74%)]">
                          {title}
                        </span>
                        {line ? ` — ${line}` : ""}
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section
                className="rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.55)] p-6"
                aria-label="Primary exports"
                id="tour-exports"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {designerUrl ? (
                    <a
                      id="tour-designer-cta"
                      href={designerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-accent inline-flex items-center justify-center rounded-xl px-5 py-3 text-[15px] font-semibold"
                    >
                      Open Workspace Designer
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={onDownloadVrcJson}
                    disabled={!canExportVrc}
                    className="rounded-xl border border-[hsl(277_90%_55%/0.35)] bg-[hsl(277_50%_22%/0.35)] px-5 py-3 text-[15px] font-semibold text-[hsl(210_40%_98%)] transition-colors hover:border-[hsl(277_90%_65%/0.45)] hover:bg-[hsl(277_90%_65%/0.12)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Download for Collab Experience
                  </button>
                </div>

                {exportTip ? (
                  <p
                    className="mt-4 rounded-xl border border-[hsl(173_80%_40%/0.35)] bg-[hsl(173_80%_40%/0.1)] px-4 py-3 text-[14px] leading-relaxed text-[hsl(210_40%_94%)]"
                    role="status"
                    aria-live="polite"
                  >
                    {exportTip}
                  </p>
                ) : null}
              </section>

              <details className="rounded-xl border border-[hsl(217_33%_22%)] bg-[hsl(220_25%_10%/0.35)] px-4 py-3 [&_summary]:cursor-pointer [&_summary]:font-medium [&_summary]:text-[hsl(215_20%_90%)]">
                <summary className="select-none">More</summary>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={onDownloadWebexDesignerJson}
                    disabled={!canExportVrc}
                    className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2.5 text-[14px] font-semibold text-[hsl(210_40%_96%)] disabled:opacity-45"
                  >
                    Download Designer JSON
                  </button>
                  <button
                    type="button"
                    onClick={onCopyAnalysisJson}
                    disabled={loading || !pretty}
                    className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2.5 text-[14px] font-semibold text-[hsl(210_40%_96%)] disabled:opacity-45"
                  >
                    {copiedJson ? "Copied JSON" : "Copy full analysis"}
                  </button>
                  <button
                    type="button"
                    onClick={onDownloadJson}
                    disabled={loading || !pretty}
                    className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2.5 text-[14px] font-semibold text-[hsl(210_40%_96%)] disabled:opacity-45"
                  >
                    Download full analysis
                  </button>
                </div>
                {designerUrl ? (
                  <p
                    className="mt-3 break-all font-mono text-[12px] leading-relaxed text-[hsl(173_85%_62%)]"
                    data-testid="designer-url"
                  >
                    {designerUrl}
                  </p>
                ) : null}
              </details>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
