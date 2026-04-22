import { Suspense } from "react";
import ResultsClient from "./results-client";

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 text-zinc-900">
          <main className="w-full max-w-3xl">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-zinc-600">Loading results…</div>
            </div>
          </main>
        </div>
      }
    >
      <ResultsClient />
    </Suspense>
  );
}

