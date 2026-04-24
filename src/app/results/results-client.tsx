"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteBrandLink } from "@/components/SiteBrand";
import {
  buildVideoRoomCalculatorJson,
  vrcJsonFileName,
} from "@/lib/collabExperienceExport";
import {
  buildWebexDesignerRoomJson,
  webexDesignerJsonFileName,
} from "webex-designer-export";
import type { RoomAnalysis } from "@/lib/roomAnalysis";
import { loadRoomAnalysisPayload } from "@/lib/resultStorage";
import { preparePhotoForUpload } from "@/lib/prepareClientPhoto";

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
  const [copiedJson, setCopiedJson] = useState(false);
  const [exportTip, setExportTip] = useState<string | null>(null);
  const [decoded, setDecoded] = useState<AnalyzeEnvelope | null>(null);
  /** False until we've read sessionStorage / URL on the client (avoid useSearchParams — it forces CSR bailout). */
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
    const id = window.setTimeout(() => setExportTip(null), 8000);
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

  const analysis = decoded && decoded.ok ? decoded.data : null;
  const meta = decoded && decoded.ok ? decoded.meta : null;

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
      "Saved snaproom-analysis.json — archive or share this file. For Collab Experience, use Download for Collab Experience (.vrc.json) above.",
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
      "Downloaded .vrc.json — import that file on collabexperience.com (Video Room Calculator). Not the same as snaproom-analysis.json.",
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
      "Downloaded Webex room JSON — at designer.webex.com open Custom rooms and drag this file onto the 3D view.",
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

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Link
                href="/wizard"
                className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2 text-sm font-medium text-[hsl(215_20%_82%)] transition-colors hover:border-[hsl(277_90%_65%/0.45)] hover:bg-[hsl(277_90%_65%/0.1)] hover:text-[hsl(210_40%_98%)]"
              >
                Guided wizard
              </Link>
              <Link
                href="/"
                className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2 text-sm font-medium text-[hsl(215_20%_82%)] transition-colors hover:border-[hsl(277_90%_65%/0.45)] hover:bg-[hsl(277_90%_65%/0.1)] hover:text-[hsl(210_40%_98%)]"
              >
                New analysis
              </Link>
            </div>
          </div>

          <section
            className="mt-8 rounded-2xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.55)] p-6"
            aria-label="Download exports"
          >
            <h2 className="text-base font-semibold text-white">Downloads</h2>

            <details className="mt-3 rounded-xl border border-[hsl(217_33%_22%)] bg-[hsl(220_25%_10%/0.35)] px-4 py-3 [&_summary]:cursor-pointer [&_summary]:font-medium [&_summary]:text-[hsl(215_20%_90%)] [&_summary]:outline-none [&_summary]:marker:text-[hsl(215_20%_58%)]">
              <summary className="select-none">
                Which file should I download?
              </summary>
              <ul className="copy-readable mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed">
                <li>
                  <strong className="font-semibold text-[hsl(210_40%_94%)]">
                    Collab Experience / Video Room Calculator
                  </strong>{" "}
                  → first button (
                  <code className="rounded border border-[hsl(217_33%_28%)] bg-[hsl(217_33%_18%/0.9)] px-1 py-0.5 font-mono text-[11px]">
                    .vrc.json
                  </code>
                  ). That is the only export Collab can open directly.
                </li>
                <li>
                  <strong className="font-semibold text-[hsl(210_40%_94%)]">
                    Webex Workspace Designer
                  </strong>{" "}
                  → second button (Custom rooms JSON). Drag the downloaded file onto
                  the 3D canvas at designer.webex.com — do not expect it to load in
                  Collab.
                </li>
                <li>
                  <strong className="font-semibold text-[hsl(210_40%_94%)]">
                    Archive or tooling
                  </strong>{" "}
                  → &quot;Download full analysis&quot; or &quot;Copy analysis
                  JSON&quot; — same SnapRoom payload for your records; not a Collab or
                  Webex import file.
                </li>
              </ul>
            </details>

            <p className="copy-readable mt-4">
              <span className="whitespace-nowrap font-medium text-[hsl(215_20%_90%)]">
                Collab / Video Room Calculator:
              </span>{" "}
              first button →{" "}
              <span className="whitespace-nowrap text-[hsl(215_20%_88%)]">collabexperience.com</span>.
              {" "}
              <span className="whitespace-nowrap font-medium text-[hsl(215_20%_90%)]">
                Webex Workspace Designer:
              </span>{" "}
              second button → drag the JSON onto the 3D view at{" "}
              <span className="whitespace-nowrap text-[hsl(215_20%_88%)]">designer.webex.com</span>{" "}
              (Custom rooms). The last button is only the app&apos;s{" "}
              <code className="rounded border border-[hsl(217_33%_28%)] bg-[hsl(217_33%_18%/0.9)] px-1 py-0.5 font-mono text-[11px] text-[hsl(215_20%_85%)]">{`{ ok, data }`}</code> JSON — not
              for those design tools.
            </p>

            <div className="mt-4 rounded-xl border border-[hsl(173_80%_40%/0.28)] bg-[hsl(173_80%_40%/0.09)] px-4 py-3 text-[15px] leading-relaxed text-[hsl(210_40%_96%)]">
              <span className="font-semibold text-[hsl(173_85%_48%)]">Import tip:</span>{" "}
              <code className="rounded border border-[hsl(217_33%_30%)] bg-[hsl(220_25%_8%/0.65)] px-1.5 py-0.5 font-mono text-[13px] text-[hsl(210_40%_96%)]">
                snaproom-analysis.json
              </code>{" "}
              (or older{" "}
              <code className="rounded border border-[hsl(217_33%_30%)] bg-[hsl(220_25%_8%/0.65)] px-1.5 py-0.5 font-mono text-[13px] text-[hsl(210_40%_96%)]">
                room-ai-analysis.json
              </code>
              ) cannot be opened in Video Room Calculator — you need{" "}
              <code className="rounded border border-[hsl(217_33%_30%)] bg-[hsl(220_25%_8%/0.65)] px-1.5 py-0.5 font-mono text-[13px] text-[hsl(210_40%_96%)]">
                .vrc.json
              </code>{" "}
              (first button).
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
                      : "Run an analysis first"
                }
              >
                Download for Collab Experience (.vrc.json)
              </button>
              <button
                type="button"
                onClick={onDownloadWebexDesignerJson}
                disabled={!canExportVrc}
                className="order-2 w-full rounded-xl border border-[hsl(277_90%_55%/0.35)] bg-[hsl(277_50%_22%/0.35)] px-4 py-3 text-[15px] font-semibold text-[hsl(210_40%_98%)] transition-colors hover:border-[hsl(277_90%_65%/0.45)] hover:bg-[hsl(277_90%_65%/0.12)] disabled:cursor-not-allowed disabled:opacity-45 sm:order-none sm:w-auto sm:px-4 sm:py-2.5"
                title={
                  canExportVrc
                    ? "Workspace Designer Custom rooms — drag JSON onto the 3D canvas"
                    : loading
                      ? "Loading saved results…"
                      : "Run an analysis first"
                }
              >
                Download for Webex Workspace Designer (.json)
              </button>
              <button
                type="button"
                onClick={onCopyAnalysisJson}
                disabled={loading || !pretty}
                title="Copies the full analysis JSON to the clipboard — for backup or notes. Collab/Webex need the dedicated download buttons."
                className="order-3 w-full rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-3 text-[15px] font-semibold text-[hsl(210_40%_96%)] transition-colors hover:border-[hsl(217_33%_35%)] hover:bg-[hsl(217_33%_18%/0.95)] disabled:cursor-not-allowed disabled:opacity-45 sm:order-none sm:w-auto sm:px-4 sm:py-2.5"
              >
                {copiedJson ? "Copied JSON" : "Copy analysis JSON"}
              </button>
              <button
                type="button"
                onClick={onDownloadJson}
                disabled={loading || !pretty}
                className="order-4 w-full rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-3 text-[15px] font-semibold text-[hsl(210_40%_96%)] transition-colors hover:border-[hsl(217_33%_35%)] hover:bg-[hsl(217_33%_18%/0.95)] disabled:cursor-not-allowed disabled:opacity-45 sm:order-none sm:w-auto sm:px-4 sm:py-2.5"
                title="App export only — not for Video Room Calculator"
              >
                Download full analysis (snaproom).json
              </button>
            </div>

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
          </section>

          <section
            className="mt-8 rounded-2xl border border-[hsl(277_90%_55%/0.22)] bg-[hsl(277_45%_14%/0.35)] p-6"
            aria-label="Workspace Designer photorealistic render"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[hsl(277_90%_72%/0.92)]">
                  Workspace Designer
                </p>
                <h2 className="text-xl font-semibold tracking-tight text-white">
                  Photorealistic AI render
                </h2>
                <p className="copy-readable max-w-[62ch]">
                  <span className="font-medium text-[hsl(215_20%_90%)]">
                    Workflow:
                  </span>{" "}
                  export a snapshot image from Workspace Designer → upload it here →
                  download the PNG. The model applies a fixed style (photorealistic
                  materials and lighting, dollhouse framing, white void outside the
                  room, people) without changing layout geometry.
                </p>
              </div>
              <a
                href="https://designer.webex.com/#article/airender/2"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2 text-sm font-medium text-[hsl(215_20%_82%)] transition-colors hover:border-[hsl(277_90%_65%/0.45)] hover:bg-[hsl(277_90%_65%/0.1)] hover:text-[hsl(210_40%_98%)]"
              >
                Webex: AI render article ↗
              </a>
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <div className="grid gap-4">
                <label className="text-[15px] font-medium text-[hsl(210_40%_96%)]">
                  Render image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    setDesignerFile(e.target.files?.[0] ?? null);
                    setPhotorealDataUrl(null);
                    setPhotorealMeta(null);
                  }}
                  className="block w-full rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.92)] px-3 py-2.5 text-[15px] text-[hsl(210_40%_96%)] outline-none transition-[box-shadow] file:mr-4 file:rounded-lg file:border-0 file:bg-[hsl(277_90%_65%/0.14)] file:px-3 file:py-2 file:text-[15px] file:font-semibold file:text-[hsl(210_40%_96%)] hover:file:bg-[hsl(277_90%_65%/0.22)] focus-visible:ring-2 focus-visible:ring-[hsl(277_90%_65%/0.45)]"
                />

                <button
                  type="button"
                  onClick={onGeneratePhotorealisticRender}
                  disabled={designerStatus === "uploading"}
                  className="btn-accent mt-1 inline-flex items-center justify-center rounded-xl px-5 py-3 text-[15px] font-semibold disabled:cursor-not-allowed"
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
                      className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-4 py-2.5 text-[15px] font-semibold text-[hsl(210_40%_96%)] transition-colors hover:border-[hsl(277_90%_65%/0.45)] hover:bg-[hsl(277_90%_65%/0.1)]"
                    >
                      Download PNG
                    </button>
                    {photorealMeta?.model || photorealMeta?.provider ? (
                      <span className="self-center text-[13px] text-[hsl(215_20%_62%)]">
                        {[
                          photorealMeta.provider === "google"
                            ? "Google (Gemini)"
                            : photorealMeta.provider === "openai"
                              ? "OpenAI"
                              : photorealMeta.provider,
                          photorealMeta.model,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <p className="copy-muted">
                  Room dimensions and Webex rubric analysis are still on the home
                  page. This block only produces a stylized image.
                </p>
              </div>

              <div className="grid gap-4">
                <div className="text-[15px] font-medium text-[hsl(210_40%_96%)]">
                  Original
                </div>
                <div className="aspect-video w-full overflow-hidden rounded-2xl border border-[hsl(217_33%_25%)] bg-black/45 ring-1 ring-[hsl(217_33%_22%/0.6)]">
                  {designerPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={designerPreviewUrl}
                      alt="Workspace Designer render preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-4 text-center text-[15px] leading-relaxed text-[hsl(215_20%_68%)]">
                      Choose a snapshot to preview it here.
                    </div>
                  )}
                </div>
                <div className="text-[15px] font-medium text-[hsl(210_40%_96%)]">
                  Photorealistic result
                </div>
                <div className="aspect-video w-full overflow-hidden rounded-2xl border border-[hsl(277_90%_55%/0.28)] bg-[hsl(220_25%_8%/0.65)] ring-1 ring-[hsl(277_90%_40%/0.35)]">
                  {photorealDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photorealDataUrl}
                      alt="Photorealistic generated render"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-4 text-center text-[15px] leading-relaxed text-[hsl(215_20%_62%)]">
                      {designerStatus === "uploading"
                        ? "Generating…"
                        : "Generated image appears here after you run the action."}
                    </div>
                  )}
                </div>
                <div className="copy-muted">
                  The snapshot is sent only to the configured image API (Gemini when
                  its key is set). It is not stored on our servers.
                </div>
              </div>
            </div>
          </section>

          {loading ? (
            <p className="copy-muted mt-3">
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

          {!loading && decoded && decoded.ok ? (
              analysis ? (
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
                      Items visible in photo
                    </div>
                    <p className="copy-muted mt-1 text-[13px] leading-relaxed">
                      Structured list of what the model noticed (aligned with
                      suggestions where relevant).
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      {(
                        [
                          [
                            "Electronics & devices",
                            observedSafe.electronicsAndDevices,
                          ],
                          ["Plants & decor", observedSafe.plantsAndDecor],
                          ["Other notable", observedSafe.otherNotable],
                        ] as const
                      ).map(([label, items]) => (
                        <div
                          key={label}
                          className="rounded-xl border border-[hsl(217_33%_22%)] bg-[hsl(220_25%_8%/0.45)] p-4"
                        >
                          <div className="text-[13px] font-semibold text-[hsl(277_90%_72%)]">
                            {label}
                          </div>
                          {items.length ? (
                            <ul className="mt-2 list-disc pl-5 text-[14px] leading-relaxed text-[hsl(215_20%_78%)]">
                              {items.map((it, i) => (
                                <li key={i}>{it}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-[14px] text-[hsl(215_20%_55%)]">
                              None noted
                            </p>
                          )}
                        </div>
                      ))}
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
                </div>
              ) : null
          ) : null}
        </div>
      </main>
    </div>
  );
}
