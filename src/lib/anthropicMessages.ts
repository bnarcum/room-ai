/** Direct Anthropic Messages API — avoids AI SDK multimodal edge cases on Vercel/Next. */

export type AnthropicCredential =
  | { kind: "apiKey"; apiKey: string }
  | { kind: "bearer"; token: string };

function trimmedEnv(key: string): string | undefined {
  const v = process.env[key];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

export function anthropicCredentialFromEnv(): AnthropicCredential | null {
  const bearer = trimmedEnv("ANTHROPIC_AUTH_TOKEN");
  if (bearer) return { kind: "bearer", token: bearer };
  const apiKey =
    trimmedEnv("ANTHROPIC_API_KEY") ??
    trimmedEnv("ANTHROPIC_KEY") ??
    trimmedEnv("CLAUDE_API_KEY");
  if (apiKey) return { kind: "apiKey", apiKey };
  return null;
}

function headersForCredential(c: AnthropicCredential): Record<string, string> {
  const base: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (c.kind === "apiKey") {
    base["x-api-key"] = c.apiKey;
    return base;
  }
  base.Authorization = `Bearer ${c.token}`;
  return base;
}

/** Concatenate assistant `text` blocks; skips thinking / tool blocks. */
export function textFromAnthropicMessageBody(data: unknown): string {
  const o = data as { content?: unknown };
  const content = o.content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content as Record<string, unknown>[]) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("");
}

export async function anthropicVisionMessages(params: {
  credential: AnthropicCredential;
  model: string;
  system: string;
  userText: string;
  mediaType: string;
  imageBase64: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const {
    credential,
    model,
    system,
    userText,
    mediaType,
    imageBase64,
    maxTokens = 16384,
    temperature = 0.25,
  } = params;

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: userText,
          },
        ],
      },
    ],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: headersForCredential(credential),
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `Anthropic ${res.status}: ${raw.slice(0, 1500)}${raw.length > 1500 ? "…" : ""}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Anthropic returned non-JSON response body.");
  }

  const text = textFromAnthropicMessageBody(data).trim();
  return text;
}
