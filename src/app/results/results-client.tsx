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
import { ResultsPhotoHero } from "@/components/ResultsPhotoHero";
import {
  COLLAB_EXPERIENCE_URL,
  buildVideoRoomCalculatorJson,
  vrcJsonFileName,
} from "@/lib/collabExperienceExport";
import { coerceRoomAnalysisPayload } from "@/lib/coerceRoomAnalysis";
import {
  type FocusRegionKey,
  resolveFocusRegion,
} from "@/lib/focusRegions";
import {
  CISCO_GUIDANCE_LABEL,
  parseRecommendationItems,
} from "@/lib/recommendationDisplay";
import {
  buildWebexDesignerRoomJson,
  webexDesignerJsonFileName,
} from "webex-designer-export";
import { roomAnalysisSchema, type RoomAnalysis } from "@/lib/roomAnalysis";
import {
  designerSeatCount,
  resultsHeadlineMeta,
  resultsHeadlineTitle,
} from "@/lib/roomSizing";
import {
  loadRoomAnalysisPayload,
  loadRoomExtraPhotoPreviews,
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
  const [extraPreviews, setExtraPreviews] = useState<string[]>([]);
  const [heroSrc, setHeroSrc] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<FocusRegionKey | null>(null);
  const [pinnedKey, setPinnedKey] = useState<FocusRegionKey | null>(null);

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
      const storedPhoto = loadRoomPhotoPreview();
      const storedExtras = loadRoomExtraPhotoPreviews();
      setPhotoPreview(storedPhoto);
      setExtraPreviews(storedExtras);
      setHeroSrc(storedPhoto);
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

  const designerUrl = analysis
    ? buildWebexDesignerSummaryUrl(
        designerSeatCount(analysis),
        analysis.roomSummary.likelyUse,
      )
    : null;

  const loading = !ready;
  const displayHero = heroSrc ?? photoPreview;
  const showingPrimary = Boolean(photoPreview && displayHero === photoPreview);
  const splitLayout = Boolean(!loading && analysis && displayHero);
  const canExportVrc = Boolean(ready && analysis);
  const activeKey = hoveredKey ?? pinnedKey;
  const activeRegion =
    analysis && activeKey && showingPrimary
      ? resolveFocusRegion(
          activeKey,
          analysis.focusRegions,
          analysis.roomSummary.likelyUse,
          analysis.roomSummary.occupancy,
        )
      : null;

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
  }

  function onOpenCollabExperience() {
    window.open(COLLAB_EXPERIENCE_URL, "_blank", "noopener,noreferrer");
    onDownloadVrcJson();
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
          className="results-quiet-link"
        >
          designer.webex.com
        </a>
        .
      </>,
    );
  }

  function togglePin(key: FocusRegionKey) {
    if (pinnedKey === key) {
      setPinnedKey(null);
      setHoveredKey(null);
      return;
    }
    setPinnedKey(key);
  }

  return (
    <div className={splitLayout ? "results-apple results-apple--split" : "results-apple"}>
      <main className="results-shell">
        <header className="results-topbar">
          <Link href="/" className="results-wordmark">
            SnapRoom
          </Link>
          <Link href="/" className="results-new">
            New analysis
          </Link>
        </header>

        {loading ? (
          <p className="results-status">Loading…</p>
        ) : null}
        {!loading && !decoded ? (
          <p className="results-status">
            No results in this tab yet.{" "}
            <Link href="/" className="results-quiet-link">
              Analyze a photo
            </Link>
            .
          </p>
        ) : null}
        {!loading && decoded && decoded.ok === false ? (
          <p className="results-status results-status--error" role="alert">
            {decoded.error}
          </p>
        ) : null}
        {!loading && parseFailed ? (
          <p className="results-status results-status--error" role="alert">
            Saved results could not be read. Run a new analysis from the home
            page.
          </p>
        ) : null}

        {!loading && analysis ? (
          <div
            className={
              displayHero ? "results-stack results-stack--split" : "results-stack"
            }
          >
            {displayHero ? (
              <div className="results-media">
                <ResultsPhotoHero
                  src={displayHero}
                  region={showingPrimary ? activeRegion : null}
                  captionKey={showingPrimary ? activeKey : null}
                  size={
                    showingPrimary
                      ? {
                          length: analysis.dimensions.length,
                          width: analysis.dimensions.width,
                          height: analysis.dimensions.height,
                          unit: analysis.dimensions.unit,
                        }
                      : null
                  }
                  onClear={() => {
                    setPinnedKey(null);
                    setHoveredKey(null);
                  }}
                />
                {extraPreviews.length > 0 && photoPreview ? (
                  <div
                    className="results-angles"
                    data-testid="results-extra-angles"
                    role="group"
                    aria-label="Room photo angles"
                  >
                    <button
                      type="button"
                      className={
                        showingPrimary
                          ? "results-angle-thumb is-active"
                          : "results-angle-thumb"
                      }
                      onClick={() => setHeroSrc(photoPreview)}
                      aria-pressed={showingPrimary}
                      aria-label="Show primary photo"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoPreview} alt="" />
                    </button>
                    {extraPreviews.map((src, index) => {
                      const selected = displayHero === src;
                      return (
                        <button
                          key={`${index}-${src.slice(0, 24)}`}
                          type="button"
                          className={
                            selected
                              ? "results-angle-thumb is-active"
                              : "results-angle-thumb"
                          }
                          onClick={() => setHeroSrc(src)}
                          aria-pressed={selected}
                          aria-label={`Show extra angle ${index + 1}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="results-copy">
              <section id="tour-room-read" aria-label="Room read">
                <h1
                  id="tour-dimensions"
                  className="results-headline"
                  data-testid="results-headline"
                >
                  <span className="results-headline-title">
                    {resultsHeadlineTitle(analysis)}
                  </span>
                  <span className="results-headline-meta">
                    {resultsHeadlineMeta(analysis)}
                  </span>
                </h1>
              </section>

              <section
                id="tour-recommendations"
                aria-label="Recommendations"
              >
                <ul className="results-recs">
                  {REC_ROWS.map(([title, key]) => {
                    const line = parseRecommendationItems(
                      analysis.recommendations[key],
                    );
                    const selected = pinnedKey === key || hoveredKey === key;
                    return (
                      <li
                        key={title}
                        className={
                          selected
                            ? "results-rec is-active"
                            : "results-rec"
                        }
                        data-testid={`rec-${title}`}
                        onMouseEnter={() => setHoveredKey(key)}
                        onMouseLeave={() => setHoveredKey(null)}
                      >
                        <button
                          type="button"
                          className="results-rec-hit"
                          aria-pressed={pinnedKey === key}
                          onClick={() => togglePin(key)}
                        >
                          <span className="results-rec-label">{title}</span>
                          {line.text ? (
                            <span className="results-rec-text">{line.text}</span>
                          ) : null}
                        </button>
                        {line.href ? (
                          <a
                            href={line.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="results-rec-link"
                            data-testid={`rec-link-${title}`}
                          >
                            {CISCO_GUIDANCE_LABEL}
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section
                className="results-actions"
                aria-label="Primary exports"
                id="tour-exports"
              >
                <div className="results-action-row">
                  {designerUrl ? (
                    <a
                      id="tour-designer-cta"
                      href={designerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="results-btn results-btn-solid"
                    >
                      Open Workspace Designer
                    </a>
                  ) : null}
                  <div className="results-action-col">
                    <button
                      type="button"
                      id="tour-collab-cta"
                      onClick={onOpenCollabExperience}
                      disabled={!canExportVrc}
                      className="results-btn results-btn-ghost"
                    >
                      Open Collab Experience
                    </button>
                    <p className="results-collab-hint">
                      New → Open File, pick the download
                    </p>
                  </div>
                </div>

                {exportTip ? (
                  <p className="results-tip" role="status" aria-live="polite">
                    {exportTip}
                  </p>
                ) : null}
              </section>

              <details className="results-more">
                <summary>More</summary>
                <div className="results-more-actions">
                  <button
                    type="button"
                    onClick={onDownloadWebexDesignerJson}
                    disabled={!canExportVrc}
                    className="results-more-btn"
                  >
                    Download Designer JSON
                  </button>
                  <button
                    type="button"
                    onClick={onCopyAnalysisJson}
                    disabled={loading || !pretty}
                    className="results-more-btn"
                  >
                    {copiedJson ? "Copied JSON" : "Copy full analysis"}
                  </button>
                  <button
                    type="button"
                    onClick={onDownloadJson}
                    disabled={loading || !pretty}
                    className="results-more-btn"
                  >
                    Download full analysis
                  </button>
                </div>
                {designerUrl ? (
                  <p
                    className="results-designer-url"
                    data-testid="designer-url"
                  >
                    {designerUrl}
                  </p>
                ) : null}
              </details>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
