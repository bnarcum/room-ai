"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { SiteBrandLink } from "@/components/SiteBrand";
import {
  buildWebexDesignerSummaryUrl,
  pickWebexRoomTier,
} from "@/lib/webexDesignerQuickUrl";
import { runClientQuickEstimate } from "@/lib/runClientQuickEstimate";
import type { QuickEstimate } from "@/lib/quickEstimate";

export default function QuickEstimatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "error" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<QuickEstimate | null>(null);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const designerUrl = estimate
    ? buildWebexDesignerSummaryUrl(estimate.seatCount)
    : null;
  const designerTier = estimate
    ? pickWebexRoomTier(estimate.seatCount)
    : null;

  async function onRun() {
    setError(null);
    setEstimate(null);
    setModelLabel(null);
    if (!file) {
      setStatus("error");
      setError("Please choose a photo to upload.");
      return;
    }

    setStatus("uploading");
    const result = await runClientQuickEstimate({ file });
    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setStatus("done");
    setEstimate(result.data);
    setModelLabel(
      result.meta?.model
        ? `${result.meta.provider ?? "anthropic"} / ${result.meta.model}`
        : null,
    );
  }

  async function onCopyLink() {
    if (!designerUrl) return;
    try {
      await navigator.clipboard.writeText(designerUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="app-backdrop flex min-h-full flex-1 flex-col items-center px-4 py-8 text-[hsl(210_40%_96%)] sm:py-10">
      <main className="w-full max-w-3xl">
        <div className="mb-6 w-full sm:mb-8">
          <SiteBrandLink
            className="max-w-[min(100%,16rem)] sm:max-w-[20rem] md:max-w-[24rem] lg:max-w-[28rem]"
            imageClassName="h-auto w-full"
            sizes="(min-width: 1024px) 28rem, (min-width: 768px) 24rem, (min-width: 640px) 20rem, 16rem"
          />
        </div>
        <div className="surface-card rounded-3xl p-7">
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[hsl(277_90%_72%/0.92)]">
              Workspace Designer
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Quick Estimate
            </h1>
            <p className="copy-readable max-w-[52ch]">
              Upload one photo. We use vision AI to estimate{" "}
              <strong className="font-semibold text-[hsl(210_40%_98%)]">
                seating capacity
              </strong>
              ,{" "}
              <strong className="font-semibold text-[hsl(210_40%_98%)]">
                screen count
              </strong>
              , and{" "}
              <strong className="font-semibold text-[hsl(210_40%_98%)]">
                primary display size
              </strong>{" "}
              — then open Cisco Workspace Designer with a matching room preset and
              chair count (              same URL style as{" "}
              <span className="whitespace-nowrap font-mono text-[13px] text-[hsl(215_20%_78%)]">
                designer.webex.com/#/room/…/summary?…&ch=…
              </span>
              ).
            </p>
            <p className="mt-2 text-[14px] text-[hsl(215_20%_70%)]">
              Need full dimensions and exports?{" "}
              <Link
                href="/"
                className="font-medium text-[hsl(277_90%_78%)] underline decoration-[hsl(277_90%_50%/0.4)] underline-offset-2 transition-colors hover:text-[hsl(210_40%_96%)] hover:decoration-[hsl(277_90%_65%/0.55)]"
              >
                Classic analysis
              </Link>{" "}
              or{" "}
              <Link
                href="/wizard"
                className="font-medium text-[hsl(277_90%_78%)] underline decoration-[hsl(277_90%_50%/0.4)] underline-offset-2 transition-colors hover:text-[hsl(210_40%_96%)] hover:decoration-[hsl(277_90%_65%/0.55)]"
              >
                Guided wizard
              </Link>
              .
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
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setEstimate(null);
                  setStatus("idle");
                }}
                className="block w-full rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.92)] px-3 py-2.5 text-[15px] text-[hsl(210_40%_96%)] outline-none transition-[box-shadow] file:mr-4 file:rounded-lg file:border-0 file:bg-[hsl(277_90%_65%/0.14)] file:px-3 file:py-2 file:text-[15px] file:font-semibold file:text-[hsl(210_40%_96%)] hover:file:bg-[hsl(277_90%_65%/0.22)] focus-visible:ring-2 focus-visible:ring-[hsl(277_90%_65%/0.45)]"
              />

              <button
                type="button"
                onClick={onRun}
                disabled={status === "uploading"}
                className="btn-accent mt-1 inline-flex items-center justify-center rounded-xl px-5 py-3 text-[15px] font-semibold disabled:cursor-not-allowed"
              >
                {status === "uploading" ? "Estimating…" : "Run quick estimate"}
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
                Tip: capture the full table run and main display wall when
                possible. This flow does not save your image on the server beyond
                the request.
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
            </div>
          </div>

          {estimate && designerUrl ? (
            <div className="mt-8 space-y-4 rounded-2xl border border-[hsl(173_80%_40%/0.28)] bg-[hsl(173_80%_40%/0.09)] p-6">
              <h2 className="text-lg font-semibold text-white">AI estimate</h2>
              <ul className="copy-readable list-inside list-disc space-y-1.5 text-[15px] leading-relaxed">
                <li>
                  <span className="font-medium text-[hsl(210_40%_94%)]">
                    Seats (for Designer link):
                  </span>{" "}
                  {estimate.seatCount}
                </li>
                <li>
                  <span className="font-medium text-[hsl(210_40%_94%)]">
                    Displays counted:
                  </span>{" "}
                  {estimate.screenCount}
                </li>
                <li>
                  <span className="font-medium text-[hsl(210_40%_94%)]">
                    Primary screen (diag.):
                  </span>{" "}
                  {estimate.primaryScreenDiagonalInches}&quot;
                </li>
              </ul>
              <p className="copy-readable text-[14px] text-[hsl(215_20%_82%)]">
                {estimate.notes}
              </p>
              {modelLabel ? (
                <p className="text-[12px] text-[hsl(215_20%_55%)]">{modelLabel}</p>
              ) : null}

              {designerTier ? (
                <p className="text-[13px] text-[hsl(215_20%_72%)]">
                  Designer preset:{" "}
                  <span className="font-medium text-[hsl(210_40%_90%)]">
                    {designerTier.roomTypeLabel}
                  </span>{" "}
                  <span className="font-mono text-[12px] text-[hsl(215_20%_58%)]">
                    ({designerTier.pathSlug})
                  </span>
                </p>
              ) : null}

              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
                <a
                  href={designerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-accent inline-flex items-center justify-center rounded-xl px-5 py-3 text-[15px] font-semibold"
                >
                  Open Workspace Designer
                </a>
                <button
                  type="button"
                  onClick={onCopyLink}
                  className="rounded-xl border border-[hsl(217_33%_25%)] bg-[hsl(217_33%_14%/0.85)] px-5 py-3 text-[15px] font-semibold text-[hsl(210_40%_96%)] transition-colors hover:border-[hsl(217_33%_35%)] hover:bg-[hsl(217_33%_18%/0.95)]"
                >
                  {copied ? "Copied link" : "Copy Designer link"}
                </button>
              </div>

              <div className="rounded-xl border border-[hsl(217_33%_28%)] bg-[hsl(220_25%_8%/0.45)] px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[hsl(215_20%_58%)]">
                  URL
                </p>
                <p className="mt-1 break-all font-mono text-[13px] leading-relaxed text-[hsl(173_85%_62%)]">
                  {designerUrl}
                </p>
              </div>

              <p className="copy-muted text-[13px] leading-relaxed">
                Chair count and room preset follow your seat estimate. Display
                size is shown for your notes — tune it inside Workspace Designer.
                For a 3D layout file you can drag into Designer, use{" "}
                <Link
                  href="/results"
                  className="font-medium text-[hsl(277_90%_78%)] underline decoration-[hsl(277_90%_50%/0.4)] underline-offset-2 hover:text-[hsl(210_40%_96%)]"
                >
                  full analysis → Results
                </Link>{" "}
                after running the classic flow.
              </p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
