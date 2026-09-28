/** Gemini vision → JSON text. Key is read from env; never hardcoded. */

export function geminiApiKeyFromEnv(): string | null {
  for (const key of ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"]) {
    const v = process.env[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function resolveGeminiModelId(explicit: string | undefined): string {
  const fallback = "gemini-3-pro-preview";
  if (!explicit?.trim()) return fallback;
  return explicit.trim();
}

function textFromGeminiBody(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  const root = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  const block = root.promptFeedback?.blockReason;
  if (block) {
    throw new Error(`Gemini blocked the request (${block}).`);
  }
  const parts = root.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("")
    .trim();
}

export async function geminiVisionJson(params: {
  apiKey: string;
  model: string;
  system: string;
  userText: string;
  mediaType: string;
  imageBase64: string;
}): Promise<string> {
  const model = encodeURIComponent(params.model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(`${url}?key=${encodeURIComponent(params.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.system }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: params.userText },
            {
              inlineData: {
                mimeType: params.mediaType,
                data: params.imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        maxOutputTokens: 16384,
      },
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `Gemini ${res.status}: ${raw.slice(0, 1500)}${raw.length > 1500 ? "…" : ""}`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Gemini returned non-JSON response body.");
  }

  const text = textFromGeminiBody(data);
  if (!text) {
    throw new Error("Gemini returned no assistant text.");
  }
  return text;
}
