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

/** Concatenate assistant `text` blocks; skips thinking / tool_use blocks. */
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

export function stopReasonFromAnthropicMessageBody(data: unknown): string | undefined {
  const o = data as { stop_reason?: unknown };
  return typeof o.stop_reason === "string" ? o.stop_reason : undefined;
}

/** Haiku variants often return 400 if a `thinking` field is present (even `disabled`). Sonnet/Opus need `disabled` to avoid empty text when extended thinking is on by default. */
export function anthropicThinkingBlock(
  model: string,
): Record<string, unknown> | undefined {
  if (model.toLowerCase().includes("haiku")) return undefined;
  return { thinking: { type: "disabled" } };
}

function errorTextMentionsThinking(body: string): boolean {
  const b = body.toLowerCase();
  return (
    b.includes("thinking") ||
    b.includes("extended_thinking") ||
    b.includes("extended thinking")
  );
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

  const messagesPayload = [
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
  ];

  function baseBody(includeThinking?: Record<string, unknown>): Record<string, unknown> {
    return {
      model,
      max_tokens: maxTokens,
      temperature,
      ...(includeThinking ?? {}),
      system,
      messages: messagesPayload,
    };
  }

  let thinkingExtras = anthropicThinkingBlock(model);
  let body = baseBody(thinkingExtras);
  let res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: headersForCredential(credential),
    body: JSON.stringify(body),
  });

  let raw = await res.text();

  if (
    !res.ok &&
    res.status === 400 &&
    thinkingExtras &&
    errorTextMentionsThinking(raw)
  ) {
    console.warn(
      JSON.stringify({
        scope: "anthropicVisionMessages",
        action: "retry_without_thinking_field",
        model,
      }),
    );
    thinkingExtras = undefined;
    body = baseBody(undefined);
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: headersForCredential(credential),
      body: JSON.stringify(body),
    });
    raw = await res.text();
  }

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

  const stopReason = stopReasonFromAnthropicMessageBody(data);
  const text = textFromAnthropicMessageBody(data).trim();

  if (!text) {
    throw new Error(
      `Anthropic returned no assistant text (stop_reason=${stopReason ?? "unknown"}).`,
    );
  }

  if (stopReason === "max_tokens") {
    console.warn(
      JSON.stringify({
        scope: "anthropicVisionMessages",
        warn: "stop_reason_max_tokens",
        model,
        textChars: text.length,
      }),
    );
  }

  return text;
}
