import {
  anthropicCredentialFromEnv,
  anthropicVisionMessages,
} from "@/lib/anthropicMessages";
import {
  geminiApiKeyFromEnv,
  geminiVisionJson,
  resolveGeminiModelId,
} from "@/lib/geminiVision";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
export const DEFAULT_ANTHROPIC_FALLBACK = "claude-haiku-4-5";

export type VisionProvider = "anthropic" | "google";

export type VisionJsonOk = {
  text: string;
  provider: VisionProvider;
  model: string;
};

type ChainEntry =
  | { provider: "anthropic"; model: string }
  | { provider: "google"; model: string };

function resolveAnthropicModelId(explicit: string | undefined): string {
  if (!explicit?.trim()) return DEFAULT_ANTHROPIC_MODEL;
  const id = explicit.trim();
  if (id === "claude-3-5-sonnet-latest") return DEFAULT_ANTHROPIC_MODEL;
  return id;
}

function resolveFallbackModelId(explicit: string | undefined): string {
  if (!explicit?.trim()) return DEFAULT_ANTHROPIC_FALLBACK;
  const id = explicit.trim();
  if (id === "claude-3-5-sonnet-latest") return DEFAULT_ANTHROPIC_FALLBACK;
  return id;
}

export function hasAnthropicCredentials(): boolean {
  return Boolean(anthropicCredentialFromEnv());
}

export function hasGeminiCredentials(): boolean {
  return Boolean(geminiApiKeyFromEnv());
}

export function buildVisionProviderChain(): ChainEntry[] {
  const out: ChainEntry[] = [];
  const seen = new Set<string>();

  if (hasAnthropicCredentials()) {
    const primary = resolveAnthropicModelId(process.env.ANTHROPIC_MODEL);
    const fb = resolveFallbackModelId(process.env.ANTHROPIC_FALLBACK_MODEL);
    for (const model of [primary, fb]) {
      const key = `anthropic:${model}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ provider: "anthropic", model });
      }
    }
  }

  if (hasGeminiCredentials()) {
    const model = resolveGeminiModelId(
      process.env.GEMINI_MODEL ?? process.env.GOOGLE_MODEL,
    );
    const key = `google:${model}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ provider: "google", model });
    }
  }

  return out;
}

export function missingVisionCredentialsMessage(): string {
  return "Missing vision credentials. Set ANTHROPIC_API_KEY (Claude Sonnet 5) and/or GEMINI_API_KEY (Gemini 3 Pro) for Production, then redeploy.";
}

function isAuthLikeError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("401") ||
    m.includes("403") ||
    m.includes("invalid api key") ||
    m.includes("authentication") ||
    m.includes("permission denied")
  );
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

async function callProvider(
  entry: ChainEntry,
  params: {
    system: string;
    userText: string;
    mediaType: string;
    imageBase64: string;
  },
): Promise<string> {
  if (entry.provider === "anthropic") {
    const credential = anthropicCredentialFromEnv();
    if (!credential) throw new Error("Anthropic credentials missing at call time.");
    return anthropicVisionMessages({
      credential,
      model: entry.model,
      system: params.system,
      userText: params.userText,
      mediaType: params.mediaType,
      imageBase64: params.imageBase64,
      maxTokens: 16384,
      temperature: 0,
    });
  }

  const apiKey = geminiApiKeyFromEnv();
  if (!apiKey) throw new Error("Gemini credentials missing at call time.");
  return geminiVisionJson({
    apiKey,
    model: entry.model,
    system: params.system,
    userText: params.userText,
    mediaType: params.mediaType,
    imageBase64: params.imageBase64,
  });
}

/**
 * Claude Sonnet 5 → Haiku, then optional Gemini 3 Pro when GEMINI_API_KEY is set.
 */
export async function runVisionJsonWithFallback(params: {
  system: string;
  userText: string;
  mediaType: string;
  imageBase64: string;
}): Promise<VisionJsonOk> {
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
    const next = chain[i + 1];
    const sameProviderAuth =
      next &&
      next.provider === entry.provider &&
      isAuthLikeError(msg);
    if (sameProviderAuth && !chain.slice(i + 1).some((e) => e.provider !== entry.provider)) {
      throw new Error(msg);
    }
  }

  throw new Error(
    errors.length > 0
      ? `Vision models could not complete the request:\n${errors.join("\n")}`
      : "Unknown error during analysis.",
  );
}
