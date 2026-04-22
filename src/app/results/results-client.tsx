"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function decodeDataParam(dataParam: string): unknown {
  const json = atob(decodeURIComponent(dataParam));
  return JSON.parse(json) as unknown;
}

export default function ResultsClient() {
  const params = useSearchParams();
  const dataParam = params.get("data");
  const [copied, setCopied] = useState(false);

  const decoded = useMemo(() => {
    if (!dataParam) return null;
    try {
      return decodeDataParam(dataParam);
    } catch {
      return null;
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

  async function onCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
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
                Copy the link to share these results, or download the JSON.
              </p>
            </div>

            <Link
              href="/"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            >
              New analysis
            </Link>
          </div>

          {!decoded ? (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              No results found in the URL. Go back and analyze a photo.
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onCopyLink}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  {copied ? "Copied" : "Copy share link"}
                </button>
                <button
                  type="button"
                  onClick={onDownloadJson}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
                >
                  Download JSON
                </button>
              </div>

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

