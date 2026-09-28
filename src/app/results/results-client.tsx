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
import { deriveCollabExportGeometry } from "@/lib/collabExportGeometry";
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
  formatDirectionalSize,
  layoutKindFromAnalysis,
  layoutKindLabel,
  likelyUseLabel,
} from "@/lib/roomSizing";
import { loadRoomAnalysisPayload } from "@/lib/resultStorage";
import { preparePhotoForUpload } from "@/lib/prepareClientPhoto";
import {
  buildWebexDesignerSummaryUrl,
  pickWebexRoomTier,
} from "@/lib/webexDesignerQuickUrl";

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

export default function ResultsClient() {
  const pathname = usePathname();
  const [copiedJson, setCopiedJson] = useState(false);
  const [exportTip, setExportTip] = useState<ReactNode>(null);
  const [decoded, setDecoded] = useState<AnalyzeEnvelope | null>(null);
  const [ready, setReady] = useState(false);
  const [designerFile, setDesignerFile] = useState<File | null>(null);
  const [designerStatus, setDesignerStatus] = useState<
    "idle" | "uploading" | "error"
  >("idle");
  const [designerError, setDesignerError] = useState<string | null>(null);
  const [photorealDataUrl, setPhotorealDataUrl] = useState<string | null>(null);
  const [photorealMeta, setPhotorealMeta] = useState<{
    provider?: string;
    model?: string;
  } | null>(null);

  const designerPreviewUrl = useMemo(() => {
    if (!designerFile) return null;
    return URL.createObjectURL(designerFile);
  }, [designerFile]);

  useEffect(() => {
    return () => {
      if (designerPreviewUrl) URL.revokeObjectURL(designerPreviewUrl);
    };
  }, [designerPreviewUrl]);

  useEffect(() => {
    if (!exportTip) return;
    const id = window.setTimeout(() => setExportTip(null), 30_000);
    return () => window.clearTimeout(id);
  }, [exportTip]);

  type PhotorealOk = {
    ok: true;
    meta?: { provider?: string; model?: string };
    imageBase64: string;
    mimeType: string;
  };
  type PhotorealEnvelope = PhotorealOk | { ok: false; error: string };

  async function onGeneratePhotorealisticRender() {
    setDesignerError(null);
    if (!designerFile) {
      setDesignerStatus("error");
      setDesignerError(
        "Please choose an image exported from Workspace Designer.",
      );
      return;
    }

    setDesignerStatus("uploading");

    let uploadFile: File;
    try {
      uploadFile = await preparePhotoForUpload(designerFile);
    } catch (e) {
      setDesignerStatus("error");
      setDesignerError(
        e instanceof Error
          ? e.message
          : "Could not prepare this image for upload.",
      );
      return;
    }

    const form = new FormData();
    form.set("photo", uploadFile);

    let res: Response;
    try {
      res = await fetch("/api/designer-photorealistic", {
        method: "POST",
        body: form,
      });
    } catch {
      setDesignerStatus("error");
      setDesignerError("Network error while uploading. Please try again.");
      return;
    }

    if (res.status === 413) {
      setDesignerStatus("error");
      setDesignerError(
        "Image was too large. Try a smaller export from Workspace Designer.",
      );
      return;
    }

    const json = (await res.json().catch(() => null)) as PhotorealEnvelope | null;
    if (!res.ok || !json || !json.ok) {
      setDesignerStatus("error");
      setDesignerError(
        (json && "error" in json && json.error) ||
          "Image generation failed. Try again or check server configuration.",
      );
      return;
    }

    const mime = json.mimeType || "image/png";
    setPhotorealDataUrl(`data:${mime};base64,${json.imageBase64}`);
    setPhotorealMeta(json.meta ?? null);
    setDesignerStatus("idle");
  }

  function onDownloadPhotorealistic() {
    if (!photorealDataUrl) return;
    const a = document.createElement("a");
    a.href = photorealDataUrl;
    a.download = "workspace-designer-photorealistic.png";
    a.click();
  }

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

  const analysis =
    decoded && decoded.ok ? parseAnalysis(decoded.data) : null;
  const meta = decoded && decoded.ok ? decoded.meta : null;
  const parseFailed = Boolean(decoded && decoded.ok && !analysis);

  const observedSafe = useMemo(() => {
    if (!analysis) {
      return {
        electronicsAndDevices: [] as string[],
        plantsAndDecor: [] as string[],
        otherNotable: [] as string[],
      };
    }
    return (
      analysis.observedItems ?? {
        electronicsAndDevices: [],
        plantsAndDecor: [],
        otherNotable: [],
      }
    );
  }, [analysis]);

  const alreadyThere = useMemo(() => {
    return [
      ...observedSafe.electronicsAndDevices,
      ...observedSafe.plantsAndDecor,
      ...observedSafe.otherNotable,
    ];
  }, [observedSafe]);

  const seatCount = analysis ? effectiveSeatCount(analysis) : 0;
  const designerUrl = analysis
    ? buildWebexDesignerSummaryUrl(seatCount)
    : null;
  const designerTier = analysis ? pickWebexRoomTier(seatCount) : null;
  const layoutKind = analysis ? layoutKindFromAnalysis(analysis) : null;
  const vrcGeometry = analysis ? deriveCollabExportGeometry(analysis) : null;

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
    setExportTip(
      "Saved snaproom-analysis.json — archive or share this file. For Collab Experience, use the .vrc.json download.",
    );
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
      "Downloaded .vrc.json — import that file on collabexperience.com (Video Room Calculator). Table, TV, and device come from this estimate.",
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
        Downloaded Webex room JSON — at{" "}
        <a
          href="https://designer.webex.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[hsl(173_85%_58%)] underline decoration-[hsl(173_85%_48%/0.55)] underline-offset-2 transition-colors hover:text-[hsl(173_85%_68%)]"
        >
          designer.webex.com
        </a>{" "}
        open Custom rooms and drag this file onto the 3D view.
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
            <div className="grid gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[hsl(277_90%_72%/0.92)]">
                Output
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                Results
              </h1>
              <p className="copy-readable max-w-[62ch]">
                Room read, directional size, five recs, then Designer or Collab
                Experience.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Link
                href="/"
                className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2 text-sm font-medium text-[hsl(215_20%_82%)] transition-colors hover:border-[hsl(277_90%_65%/0.45)] hover:bg-[hsl(277_90%_65%/0.1)] hover:text-[hsl(210_40%_98%)]"
              >
                New analysis
              </Link>
            </div>
          </div>

          {loading ? (
            <p className="copy-muted mt-6">
              Loading saved results from this browser tab…
            </p>
          ) : null}
          {!loading && !decoded ? (
            <div className="mt-6 rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.65)] p-4 text-[15px] leading-relaxed text-[hsl(215_20%_84%)]">
              No results in this tab yet. Go back and run{" "}
              <Link
                href="/"
                className="font-semibold text-white underline decoration-[hsl(277_90%_65%/0.45)] underline-offset-2 hover:decoration-[hsl(277_90%_72%)]"
              >
                SnapRoom
              </Link>{" "}
              on a photo to populate this page.
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
              <section
                className="rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.45)] p-5"
                id="tour-room-read"
                aria-label="Room read"
              >
                <div className="text-sm font-medium text-[hsl(210_40%_98%)]">
                  Room read
                </div>
                <p className="mt-3 text-[17px] font-semibold text-white">
                  {likelyUseLabel(analysis.roomSummary.likelyUse)}
                  {layoutKind ? ` · ${layoutKindLabel(layoutKind)}` : ""}
                  {` · ${seatCount} seats`}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-[hsl(215_20%_78%)]">
                  <span className="font-medium text-[hsl(215_20%_90%)]">
                    Already there:{" "}
                  </span>
                  {alreadyThere.length
                    ? alreadyThere.join(" · ")
                    : "Nothing notable called out in the photo."}
                </p>
                {analysis.roomSummary.keyConstraints.length ? (
                  <ul className="mt-3 list-disc pl-5 text-[14px] leading-relaxed text-[hsl(215_20%_68%)]">
                    {analysis.roomSummary.keyConstraints.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section
                className="rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.45)] p-5"
                id="tour-dimensions"
                aria-label="Directional size"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-[hsl(210_40%_98%)]">
                    Directional size
                  </div>
                  {meta?.model ? (
                    <div className="text-sm text-[hsl(215_20%_68%)]">
                      Model: {meta.model}
                    </div>
                  ) : null}
                </div>
                <p className="mt-3 text-[20px] font-semibold tracking-tight text-white">
                  {formatDirectionalSize(analysis)}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[hsl(215_20%_72%)]">
                  Confidence:{" "}
                  {Math.round(analysis.dimensions.confidence * 100)}% —{" "}
                  {analysis.dimensions.reasoning}
                </p>
                <p className="mt-2 text-[13px] text-[hsl(215_20%_55%)]">
                  Midpoints for exports: {analysis.dimensions.length} ×{" "}
                  {analysis.dimensions.width} × {analysis.dimensions.height}{" "}
                  {analysis.dimensions.unit}. Reference:{" "}
                  {analysis.detectedReference.type.replace(/-/g, " ")}.
                </p>
              </section>

              <section
                className="rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.45)] p-5"
                id="tour-recommendations"
                aria-label="Recommendations"
              >
                <div className="text-sm font-medium text-[hsl(210_40%_98%)]">
                  Recommendations
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {(
                    [
                      ["Camera", analysis.recommendations.camera],
                      ["Display", analysis.recommendations.display],
                      ["Audio", analysis.recommendations.acoustics],
                      ["Lighting", analysis.recommendations.lighting],
                      ["Network", analysis.recommendations.network],
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
              </section>

              <section
                className="rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.55)] p-6"
                aria-label="Primary exports"
                id="tour-exports"
              >
                <h2 className="text-base font-semibold text-white">Next steps</h2>
                <p className="copy-readable mt-2">
                  Open Designer from this seat count, or download Collab
                  Experience with table, TV, and device taken from the estimate.
                </p>

                {designerTier && designerUrl ? (
                  <p className="mt-3 text-[13px] text-[hsl(215_20%_72%)]">
                    Designer preset:{" "}
                    <span className="font-medium text-[hsl(210_40%_90%)]">
                      {designerTier.roomTypeLabel}
                    </span>{" "}
                    <span className="font-mono text-[12px] text-[hsl(215_20%_58%)]">
                      ({designerTier.pathSlug}, {seatCount} seats)
                    </span>
                  </p>
                ) : null}

                {vrcGeometry ? (
                  <p
                    className="mt-2 text-[13px] text-[hsl(215_20%_72%)]"
                    data-testid="vrc-derived-fields"
                  >
                    Collab export: table {vrcGeometry.tableWidth} ×{" "}
                    {vrcGeometry.tableLength} {analysis.dimensions.unit} ·{" "}
                    {vrcGeometry.tvDiag}&quot; · {vrcGeometry.device.label}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
                    Download Collab Experience (.vrc.json)
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

                {exportTip ? (
                  <p
                    className="mt-4 rounded-xl border border-[hsl(173_80%_40%/0.35)] bg-[hsl(173_80%_40%/0.1)] px-4 py-3 text-[14px] leading-relaxed text-[hsl(210_40%_94%)]"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="font-semibold text-[hsl(173_85%_52%)]">
                      Next step:{" "}
                    </span>
                    {exportTip}
                  </p>
                ) : null}

                <details className="mt-5 rounded-xl border border-[hsl(217_33%_22%)] bg-[hsl(220_25%_10%/0.35)] px-4 py-3 [&_summary]:cursor-pointer [&_summary]:font-medium [&_summary]:text-[hsl(215_20%_90%)]">
                  <summary className="select-none">More downloads</summary>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={onDownloadWebexDesignerJson}
                      disabled={!canExportVrc}
                      className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2.5 text-[14px] font-semibold text-[hsl(210_40%_96%)] disabled:opacity-45"
                    >
                      Download Designer room JSON
                    </button>
                    <button
                      type="button"
                      onClick={onCopyAnalysisJson}
                      disabled={loading || !pretty}
                      className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2.5 text-[14px] font-semibold text-[hsl(210_40%_96%)] disabled:opacity-45"
                    >
                      {copiedJson ? "Copied JSON" : "Copy analysis JSON"}
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
                </details>
              </section>
            </div>
          ) : null}

          <details className="mt-8 rounded-2xl border border-[hsl(277_90%_55%/0.22)] bg-[hsl(277_45%_14%/0.35)] p-5 [&_summary]:cursor-pointer">
            <summary className="text-sm font-medium text-white">
              Photorealistic render (optional)
            </summary>
            <div className="mt-4 grid gap-4">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  setDesignerFile(e.target.files?.[0] ?? null);
                  setPhotorealDataUrl(null);
                  setPhotorealMeta(null);
                }}
                className="block w-full rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.92)] px-3 py-2.5 text-[15px] text-[hsl(210_40%_96%)] outline-none file:mr-4 file:rounded-lg file:border-0 file:bg-[hsl(277_90%_65%/0.14)] file:px-3 file:py-2 file:text-[15px] file:font-semibold file:text-[hsl(210_40%_96%)]"
              />
              <button
                type="button"
                onClick={onGeneratePhotorealisticRender}
                disabled={designerStatus === "uploading"}
                className="btn-accent inline-flex items-center justify-center rounded-xl px-5 py-3 text-[15px] font-semibold disabled:cursor-not-allowed"
              >
                {designerStatus === "uploading"
                  ? "Generating…"
                  : "Generate photorealistic render"}
              </button>
              {designerError ? (
                <p
                  className="rounded-xl border border-red-500/25 bg-red-950/40 px-3 py-2 text-[15px] leading-snug text-red-200"
                  role="alert"
                >
                  {designerError}
                </p>
              ) : null}
              {photorealDataUrl ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onDownloadPhotorealistic}
                    className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2.5 text-[15px] font-semibold"
                  >
                    Download PNG
                  </button>
                  {photorealMeta?.model ? (
                    <span className="self-center text-[13px] text-[hsl(215_20%_62%)]">
                      {photorealMeta.model}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {designerPreviewUrl || photorealDataUrl ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="aspect-video overflow-hidden rounded-xl border border-[hsl(217_33%_25%)] bg-black/45">
                    {designerPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={designerPreviewUrl}
                        alt="Workspace Designer render preview"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="aspect-video overflow-hidden rounded-xl border border-[hsl(277_90%_55%/0.28)] bg-[hsl(220_25%_8%/0.65)]">
                    {photorealDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photorealDataUrl}
                        alt="Photorealistic generated render"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      </main>
    </div>
  );
}
