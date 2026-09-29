import type { VisionImagePart } from "@/lib/analyzePhotos";
import {
  geminiApiKeyFromEnv,
  geminiVisionJson,
  resolveGeminiModelId,
} from "@/lib/geminiVision";

export type VisionProvider = "google";

export type VisionJsonOk = {
  text: string;
  provider: VisionProvider;
  model: string;
};

type ChainEntry = { provider: "google"; model: string };

export function hasGeminiCredentials(): boolean {
  return Boolean(geminiApiKeyFromEnv());
}

export function buildVisionProviderChain(): ChainEntry[] {
  if (!hasGeminiCredentials()) return [];
  const model = resolveGeminiModelId(
    process.env.GEMINI_MODEL ?? process.env.GOOGLE_MODEL,
  );
  return [{ provider: "google", model }];
}

export function missingVisionCredentialsMessage(): string {
  return "Missing vision credentials. Set GEMINI_API_KEY (Gemini 3 Pro) for Production, then redeploy.";
}

function isTransientProviderError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("high demand") ||
    m.includes("overloaded") ||
    m.includes("capacity") ||
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("temporarily") ||
    m.includes("try again later") ||
    m.includes("experiencing") ||
    m.includes("failed after") ||
    m.includes("503") ||
    m.includes("529") ||
    m.includes("429") ||
    /\b503\b/.test(message) ||
    /\b529\b/.test(message) ||
    /\b429\b/.test(message)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type VisionCallParams = {
  system: string;
  userText: string;
  mediaType?: string;
  imageBase64?: string;
  images?: VisionImagePart[];
};

async function callProvider(
  entry: ChainEntry,
  params: VisionCallParams,
): Promise<string> {
  const apiKey = geminiApiKeyFromEnv();
  if (!apiKey) throw new Error("Gemini credentials missing at call time.");
  return geminiVisionJson({
    apiKey,
    model: entry.model,
    system: params.system,
    userText: params.userText,
    mediaType: params.mediaType,
    imageBase64: params.imageBase64,
    images: params.images,
  });
}

/** Gemini 3.1 Pro only. Retries transient failures. Does not call Claude. */
export async function runVisionJsonWithFallback(
  params: VisionCallParams,
): Promise<VisionJsonOk> {
  const chain = buildVisionProviderChain();
  if (chain.length === 0) {
    throw new Error(missingVisionCredentialsMessage());
  }

  const errors: string[] = [];
  const primaryWaits = [2000, 5000, 10000];
  const failoverWaits = [2500];

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    const waits = i === 0 ? primaryWaits : failoverWaits;
    let lastErr: unknown;
    let succeeded = false;
    let text = "";

    for (let attempt = 0; attempt <= waits.length; attempt++) {
      try {
        text = await callProvider(entry, params);
        succeeded = true;
        break;
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        const willRetry = attempt < waits.length && isTransientProviderError(msg);
        if (!willRetry) break;
        await sleep(waits[attempt] ?? 2000);
      }
    }

    if (succeeded) {
      return { text, provider: entry.provider, model: entry.model };
    }

    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    errors.push(`${entry.provider}/${entry.model}: ${msg}`);
  }

  throw new Error(
    errors.length > 0
      ? `Vision models could not complete the request:\n${errors.join("\n")}`
      : "Unknown error during analysis.",
  );
}
